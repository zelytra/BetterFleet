import { describe, it, expect } from "vitest";
import {
  DETECTION_PROMPT_AFTER_MS,
  DetectionWatchdog,
} from "@/objects/fleet/DetectionWatchdog.ts";
import { PlayerStates } from "@/objects/fleet/Player.ts";

// The guided-diagnostic offer (#688) must fire once, late, and never mid-countdown — these pin the
// timing rules of the pure watchdog.

const T0 = 1_000_000;
const LATE = T0 + DETECTION_PROMPT_AFTER_MS;

describe("DetectionWatchdog", () => {
  it("fires once when detection stays silent past the threshold", () => {
    const w = new DetectionWatchdog();
    expect(w.observe(PlayerStates.IN_GAME, false, false, T0)).toBe(false);
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE - 1)).toBe(false);
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE)).toBe(true);
    // Once per game: the silence continuing must not nag again.
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE + 60_000)).toBe(
      false,
    );
  });

  it("never fires while a server is detected, and a later silence restarts the clock", () => {
    const w = new DetectionWatchdog();
    w.observe(PlayerStates.IN_GAME, false, false, T0);
    expect(w.observe(PlayerStates.IN_GAME, true, false, LATE)).toBe(false);
    // Server lost again: the threshold counts from the new silence, not from T0.
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE + 1)).toBe(false);
    expect(
      w.observe(
        PlayerStates.IN_GAME,
        false,
        false,
        LATE + 1 + DETECTION_PROMPT_AFTER_MS,
      ),
    ).toBe(true);
  });

  it("delays the offer during a countdown instead of consuming it", () => {
    const w = new DetectionWatchdog();
    w.observe(PlayerStates.IN_GAME, false, false, T0);
    expect(w.observe(PlayerStates.IN_GAME, false, true, LATE)).toBe(false);
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE + 1)).toBe(true);
  });

  it("leaving the game resets both the clock and the once-per-game guard", () => {
    const w = new DetectionWatchdog();
    w.observe(PlayerStates.IN_GAME, false, false, T0);
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE)).toBe(true);
    w.observe(PlayerStates.MAIN_MENU, false, false, LATE + 1_000);
    // A fresh game earns a fresh offer, timed from the new entry.
    expect(w.observe(PlayerStates.IN_GAME, false, false, LATE + 2_000)).toBe(
      false,
    );
    expect(
      w.observe(
        PlayerStates.IN_GAME,
        false,
        false,
        LATE + 2_000 + DETECTION_PROMPT_AFTER_MS,
      ),
    ).toBe(true);
  });
});
