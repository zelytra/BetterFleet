import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import {
  DETECTION_PROMPT_AFTER_MS,
  DetectionWatchdog,
  detectionPrompt,
  observeDetection,
} from "@/objects/fleet/DetectionWatchdog.ts";
import { Player, PlayerStates } from "@/objects/fleet/Player.ts";

// The guided-diagnostic offer (#688) must fire once, late, and never mid-countdown: these pin the
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

// The banner itself (#893): report #1151 was filed fifteen minutes after the server had resolved,
// off a banner that had fired during a slow join and then stayed up for the rest of the game.
// The offer must go away the moment it no longer applies - whichever watchdog raised it.
describe("the offer follows the detection state", () => {
  const playerAt = (status: PlayerStates, serverIp: string) =>
    ({ status, server: serverIp ? { ip: serverIp } : undefined }) as Player;
  const silent = playerAt(PlayerStates.IN_GAME, "");
  const resolved = playerAt(PlayerStates.IN_GAME, "20.33.41.156");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    detectionPrompt.visible = false;
  });
  afterEach(() => {
    // Leaving the game resets the module-level watchdog for the next test.
    observeDetection(playerAt(PlayerStates.CLOSED, ""));
    detectionPrompt.visible = false;
    vi.useRealTimers();
  });

  function raiseTheOffer() {
    observeDetection(silent);
    vi.setSystemTime(LATE);
    observeDetection(silent);
    expect(detectionPrompt.visible).toBe(true);
  }

  it("withdraws the offer the moment detection resolves", () => {
    raiseTheOffer();
    observeDetection(resolved);
    expect(detectionPrompt.visible).toBe(false);
  });

  it("withdraws the offer when the game closes", () => {
    raiseTheOffer();
    observeDetection(playerAt(PlayerStates.CLOSED, ""));
    expect(detectionPrompt.visible).toBe(false);
  });

  it("keeps the offer up while the silence lasts", () => {
    raiseTheOffer();
    vi.setSystemTime(LATE + 5 * 60_000);
    observeDetection(silent);
    expect(detectionPrompt.visible).toBe(true);
  });

  it("does not bring the offer back for the same game once it was withdrawn", () => {
    raiseTheOffer();
    observeDetection(resolved);
    // The server is lost again: a new silent stretch, but the once-per-game guard holds.
    vi.setSystemTime(LATE + 2 * DETECTION_PROMPT_AFTER_MS);
    observeDetection(silent);
    expect(detectionPrompt.visible).toBe(false);
  });

  it("leaves the socketless offer alone while the game shows no server", () => {
    // The socketless watchdog raises the same banner while the game is merely STARTED (report
    // id 801): the in-game watchdog's ticks must not take that offer down for being off-server.
    detectionPrompt.visible = true;
    observeDetection(playerAt(PlayerStates.STARTED, ""));
    expect(detectionPrompt.visible).toBe(true);
    // ... but detection resolving makes that offer moot too.
    observeDetection(playerAt(PlayerStates.STARTED, "20.33.41.156"));
    expect(detectionPrompt.visible).toBe(false);
  });
});
