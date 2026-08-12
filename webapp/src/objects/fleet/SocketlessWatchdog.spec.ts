import { describe, it, expect } from "vitest";
import {
  SOCKETLESS_PROMPT_AFTER_MS,
  MIN_EMPTY_PORT_CYCLES,
  SocketlessWatchdog,
} from "@/objects/fleet/SocketlessWatchdog.ts";
import { PlayerStates } from "@/objects/fleet/Player.ts";

// The socketless diagnostic offer (report id 801) must fire once, late, never while detection works, and never
// mid-countdown: these pin the timing rules of the pure watchdog.

const T0 = 1_000_000;
const LATE = T0 + SOCKETLESS_PROMPT_AFTER_MS;
const BLIND = MIN_EMPTY_PORT_CYCLES;

describe("SocketlessWatchdog", () => {
  it("fires once when the game stays socketless past the threshold", () => {
    const w = new SocketlessWatchdog();
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, T0)).toBe(
      false,
    );
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE - 1)).toBe(
      false,
    );
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE)).toBe(
      true,
    );
    // Once per game: the blindness continuing must not nag again.
    expect(
      w.observe(PlayerStates.STARTED, BLIND + 100, false, false, LATE + 60_000),
    ).toBe(false);
  });

  it("ignores empty-enumeration blips below the cycle floor", () => {
    // One or two empty cycles are ordinary socket-table hiccups: the clock must not even start,
    // however long they keep recurring, as long as the count keeps resetting below the floor.
    const w = new SocketlessWatchdog();
    w.observe(PlayerStates.STARTED, BLIND - 1, false, false, T0);
    expect(
      w.observe(PlayerStates.STARTED, BLIND - 1, false, false, LATE + 1),
    ).toBe(false);
    // The real blind stretch is timed from when the floor is crossed, not from T0.
    w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 2);
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 3)).toBe(
      false,
    );
    expect(
      w.observe(
        PlayerStates.STARTED,
        BLIND,
        false,
        false,
        LATE + 2 + SOCKETLESS_PROMPT_AFTER_MS,
      ),
    ).toBe(true);
  });

  it("never fires while detection works, and sockets reappearing restart the clock", () => {
    const w = new SocketlessWatchdog();
    w.observe(PlayerStates.STARTED, BLIND, false, false, T0);
    // The enumeration found ports again (count reset Rust-side): a normal launch finishing.
    expect(w.observe(PlayerStates.MAIN_MENU, 0, false, false, LATE)).toBe(
      false,
    );
    // A server resolving is the strongest "detection works" signal: never show the offer.
    expect(w.observe(PlayerStates.IN_GAME, 0, true, false, LATE + 1)).toBe(
      false,
    );
    // Blind again mid-session (sockets vanished): the threshold counts from the new stretch.
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 2)).toBe(
      false,
    );
    expect(
      w.observe(
        PlayerStates.STARTED,
        BLIND,
        false,
        false,
        LATE + 2 + SOCKETLESS_PROMPT_AFTER_MS,
      ),
    ).toBe(true);
  });

  it("delays the offer during a countdown instead of consuming it", () => {
    const w = new SocketlessWatchdog();
    w.observe(PlayerStates.STARTED, BLIND, false, false, T0);
    expect(w.observe(PlayerStates.STARTED, BLIND, false, true, LATE)).toBe(
      false,
    );
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 1)).toBe(
      true,
    );
  });

  it("closing the game resets both the clock and the once-per-game guard", () => {
    const w = new SocketlessWatchdog();
    w.observe(PlayerStates.STARTED, BLIND, false, false, T0);
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE)).toBe(
      true,
    );
    w.observe(PlayerStates.CLOSED, 0, false, false, LATE + 1_000);
    // A fresh launch earns a fresh hint, timed from the new blind stretch.
    expect(
      w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 2_000),
    ).toBe(false);
    expect(
      w.observe(
        PlayerStates.STARTED,
        BLIND,
        false,
        false,
        LATE + 2_000 + SOCKETLESS_PROMPT_AFTER_MS,
      ),
    ).toBe(true);
  });

  it("holds the once-per-game guard across a socketed interlude within one game", () => {
    // Fired, then sockets came back and vanished again without the game restarting
    // the game: they have already been told once, so the same game must not nag twice.
    const w = new SocketlessWatchdog();
    w.observe(PlayerStates.STARTED, BLIND, false, false, T0);
    expect(w.observe(PlayerStates.STARTED, BLIND, false, false, LATE)).toBe(
      true,
    );
    w.observe(PlayerStates.MAIN_MENU, 0, false, false, LATE + 1_000);
    w.observe(PlayerStates.STARTED, BLIND, false, false, LATE + 2_000);
    expect(
      w.observe(
        PlayerStates.STARTED,
        BLIND,
        false,
        false,
        LATE + 2_000 + SOCKETLESS_PROMPT_AFTER_MS,
      ),
    ).toBe(false);
  });
});
