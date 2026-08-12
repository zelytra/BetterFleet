import { Player, PlayerStates } from "@/objects/fleet/Player.ts";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";
import { detectionPrompt } from "@/objects/fleet/DetectionWatchdog.ts";

// Socketless-game watchdog. Some players' games run while exposing ZERO UDP sockets to every
// enumeration, cycle after cycle (production report id 801): detection is structurally blind and
// the Rust loop reports "launching" forever. The cause is deliberately NOT asserted anywhere - it
// could be a proxying tool, an enumeration failure, a permissions change - and VPN use in
// particular is a normal, supported way to play (region targeting). So when the signature holds
// long enough, this fires the EXISTING #688 guided-diagnostic offer ("detection stayed silent -
// run a capture?"): neutral copy, and the resulting report carries the evidence (empty port lists,
// raw_packets) that triage actually needs. The decision logic is a pure class fed by the existing
// 400ms game poll, mirroring DetectionWatchdog (#688), so the timing rules are unit-testable
// without timers.

/** How long the game may run socketless before the diagnostic offer shows. Long on purpose: a
 *  genuine launch also has no UDP sockets for a while, and prompting during a slow launch would be
 *  worse than waiting a little longer. */
export const SOCKETLESS_PROMPT_AFTER_MS = 3 * 60 * 1000;
/** Consecutive empty-enumeration cycles (Rust-side, one per detection cycle) before the signal is
 *  trusted at all: a one-off empty cycle is an ordinary socket-table hiccup. */
export const MIN_EMPTY_PORT_CYCLES = 3;

export class SocketlessWatchdog {
  private blindSince: number | null = null;
  private firedThisGame = false;

  /**
   * Feeds one observation; returns true exactly once per game-process lifetime, when the blind
   * signature (game alive, UDP enumeration empty cycle after cycle, no server) has held past the
   * threshold. A countdown delays the offer instead of consuming it - interrupting the launch
   * ritual with a banner would be worse than waiting.
   */
  observe(
    status: PlayerStates,
    noUdpCycles: number,
    hasServer: boolean,
    countdownRunning: boolean,
    nowMs: number,
  ): boolean {
    if (status === PlayerStates.CLOSED) {
      // The game exited: that ends the "game session", the next launch earns a fresh offer.
      this.blindSince = null;
      this.firedThisGame = false;
      return false;
    }
    if (hasServer || noUdpCycles < MIN_EMPTY_PORT_CYCLES) {
      // Sockets are visible (or detection outright works): the offer must NEVER show. Only a NEW
      // blind stretch restarts the clock, and the once-per-game guard keeps holding.
      this.blindSince = null;
      return false;
    }
    if (this.blindSince === null) {
      this.blindSince = nowMs;
    }
    if (
      !this.firedThisGame &&
      !countdownRunning &&
      nowMs - this.blindSince >= SOCKETLESS_PROMPT_AFTER_MS
    ) {
      this.firedThisGame = true;
      return true;
    }
    return false;
  }
}

const watchdog = new SocketlessWatchdog();

// Dev builds can force the watchdog's input to "game socketless, no server" so the offer can be
// exercised without staging the real condition. Always false in production (the toggle below is
// stripped from the bundle), so the branch that reads it is dead-code-eliminated.
let devForceBlind = false;

/**
 * Called from the game poll: one observation per tick, straight off the Rust payload. On fire it
 * raises the SAME banner as the #688 in-game silence path - one neutral "run a diagnostic?" offer,
 * whichever watchdog earned it first.
 */
export function observeSocketless(rust: RustSotServer, player: Player): void {
  let status = rust.status;
  let noUdpCycles = rust.noUdpCycles ?? 0;
  let hasServer = !!player.server?.ip;
  if (import.meta.env.DEV && devForceBlind) {
    status = PlayerStates.STARTED;
    noUdpCycles = MIN_EMPTY_PORT_CYCLES;
    hasServer = false;
  }
  const fired = watchdog.observe(
    status,
    noUdpCycles,
    hasServer,
    player.countDown !== undefined,
    Date.now(),
  );
  if (fired) {
    detectionPrompt.visible = true;
  }
}

// --- Dev-only preview handle (removed from production builds) -------------------------------------
// Staging the real condition means a game that exposes no sockets for three minutes. In a dev build
// this drives the watchdog through the real path from the console (the banner itself is #688's -
// betterfleet.detection.offer() shows it directly):
//   betterfleet.socketless.simulate()   : feed "game socketless, no server"; pass false to stop
if (import.meta.env.DEV && typeof window !== "undefined") {
  const scope = window as unknown as { betterfleet?: Record<string, unknown> };
  scope.betterfleet = {
    ...(scope.betterfleet ?? {}),
    socketless: {
      simulate: (on = true) => {
        devForceBlind = on;
      },
    },
  };
  console.info(
    "[BetterFleet] dev: betterfleet.socketless.simulate() drives the socketless path to the " +
      "#688 diagnostic offer through the real 3min threshold.",
  );
}
