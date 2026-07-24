import { reactive } from "vue";
import { Player, PlayerStates } from "@/objects/fleet/Player.ts";

// Guided diagnostic (#688). When the player is in game and server detection stays silent past a
// threshold, the lobby offers — once — to run the #364 capture. The decision logic is a pure class
// fed by the existing 400ms game poll, so the timing rules are unit-testable without timers.

/** How long detection may stay silent in game before the offer shows. */
export const DETECTION_PROMPT_AFTER_MS = 60 * 1000;

export class DetectionWatchdog {
  private inGameSilentSince: number | null = null;
  private firedThisGame = false;

  /**
   * Feeds one observation; returns true exactly once per continuous in-game period, when the
   * threshold is crossed. A countdown delays the offer instead of consuming it — interrupting the
   * launch ritual with a diagnostic banner would be worse than waiting.
   */
  observe(
    status: PlayerStates,
    hasServer: boolean,
    countdownRunning: boolean,
    nowMs: number,
  ): boolean {
    if (status !== PlayerStates.IN_GAME) {
      // Leaving the game ends the "game session": the next one earns a fresh offer.
      this.inGameSilentSince = null;
      this.firedThisGame = false;
      return false;
    }
    if (hasServer) {
      // Detection did its job; only a NEW silent stretch (server lost again) restarts the clock,
      // and the once-per-game guard keeps holding.
      this.inGameSilentSince = null;
      return false;
    }
    if (this.inGameSilentSince === null) {
      this.inGameSilentSince = nowMs;
    }
    if (
      !this.firedThisGame &&
      !countdownRunning &&
      nowMs - this.inGameSilentSince >= DETECTION_PROMPT_AFTER_MS
    ) {
      this.firedThisGame = true;
      return true;
    }
    return false;
  }
}

/** What the lobby renders: prompt flips true when the watchdog fires, and false on dismiss. */
export const detectionPrompt = reactive({ visible: false });

const watchdog = new DetectionWatchdog();

// Dev builds can force the watchdog's input to "in game, no server" so the offer can be exercised
// without staging a genuinely stuck detection in game. Always false in production (the toggle below
// is stripped from the bundle), so the branch that reads it is dead-code-eliminated.
let devForceStuck = false;

/** Called from the game poll: one observation per tick. */
export function observeDetection(player: Player): void {
  let status = player.status;
  let hasServer = !!player.server?.ip;
  if (import.meta.env.DEV && devForceStuck) {
    status = PlayerStates.IN_GAME;
    hasServer = false;
  }
  const fired = watchdog.observe(
    status,
    hasServer,
    player.countDown !== undefined,
    Date.now(),
  );
  if (fired) {
    detectionPrompt.visible = true;
  }
}

export function dismissDetectionPrompt(): void {
  detectionPrompt.visible = false;
}

// --- Dev-only preview handles (removed from production builds) ------------------------------------
// Reproducing the offer for real means sitting in game for a minute with detection genuinely stuck,
// which is awkward to stage on purpose. In a dev build these expose it on the browser console (open
// the dev webview's devtools). You must be in a session lobby for the banner to have somewhere to
// render:
//   betterfleet.detection.offer()             — show the banner right now
//   betterfleet.detection.simulateStuck()     — feed the watchdog "in game, no server" so the offer
//                                               fires through the real 60s path; pass false to stop
if (import.meta.env.DEV && typeof window !== "undefined") {
  const scope = window as unknown as { betterfleet?: Record<string, unknown> };
  scope.betterfleet = {
    ...(scope.betterfleet ?? {}),
    detection: {
      offer: () => {
        detectionPrompt.visible = true;
      },
      simulateStuck: (on = true) => {
        devForceStuck = on;
      },
    },
  };
  console.info(
    "[BetterFleet] dev: betterfleet.detection.offer() shows the stuck-detection banner now; " +
      "betterfleet.detection.simulateStuck() drives it through the real 60s path.",
  );
}
