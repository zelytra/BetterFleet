import { reactive } from "vue";
import { Player, PlayerStates } from "@/objects/fleet/Player.ts";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";

// Interceptor hint (#801). A gaming VPN / ping optimizer (ExitLag, WTFast, NoLag, Mudfish -
// popular with SoT players) terminates the game's UDP in its own process and tunnels the traffic:
// SoTGame.exe then exposes ZERO UDP sockets to every enumeration, detection is structurally blind,
// and the Rust loop reports "launching" forever. When that signature holds long enough, the lobby
// names the cause once instead of leaving the player staring at a detection that can never work.
// The decision logic is a pure class fed by the existing 400ms game poll, mirroring
// DetectionWatchdog (#688), so the timing rules are unit-testable without timers.

/** How long the game may run socketless before the hint shows. Long on purpose: a genuine launch
 *  also has no UDP sockets for a while, and blaming a VPN during a slow launch would be worse than
 *  saying nothing a little longer. */
export const INTERCEPTOR_HINT_AFTER_MS = 3 * 60 * 1000;
/** Consecutive empty-enumeration cycles (Rust-side, one per detection cycle) before the signal is
 *  trusted at all: a one-off empty cycle is an ordinary socket-table hiccup, not an interceptor. */
export const MIN_EMPTY_PORT_CYCLES = 3;

export class InterceptorWatchdog {
  private blindSince: number | null = null;
  private firedThisGame = false;

  /**
   * Feeds one observation; returns true exactly once per game-process lifetime, when the blind
   * signature (game alive, UDP enumeration empty cycle after cycle, no server) has held past the
   * threshold. A countdown delays the hint instead of consuming it - interrupting the launch
   * ritual with a "your VPN broke detection" banner would be worse than waiting.
   */
  observe(
    status: PlayerStates,
    noUdpCycles: number,
    hasServer: boolean,
    countdownRunning: boolean,
    nowMs: number,
  ): boolean {
    if (status === PlayerStates.CLOSED) {
      // The game exited: that ends the "game session", the next launch earns a fresh hint.
      this.blindSince = null;
      this.firedThisGame = false;
      return false;
    }
    if (hasServer || noUdpCycles < MIN_EMPTY_PORT_CYCLES) {
      // Sockets are visible (or detection outright works): the hint must NEVER show. Only a NEW
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
      nowMs - this.blindSince >= INTERCEPTOR_HINT_AFTER_MS
    ) {
      this.firedThisGame = true;
      return true;
    }
    return false;
  }
}

/** What the lobby renders: hint flips true when the watchdog fires, and false on dismiss. */
export const interceptorHint = reactive({ visible: false });

const watchdog = new InterceptorWatchdog();

// Dev builds can force the watchdog's input to "game socketless, no server" so the hint can be
// exercised without a real VPN. Always false in production (the toggle below is stripped from the
// bundle), so the branch that reads it is dead-code-eliminated.
let devForceBlind = false;

/** Called from the game poll: one observation per tick, straight off the Rust payload. */
export function observeInterceptor(rust: RustSotServer, player: Player): void {
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
    interceptorHint.visible = true;
  }
}

export function dismissInterceptorHint(): void {
  interceptorHint.visible = false;
}

// --- Dev-only preview handles (removed from production builds) ------------------------------------
// Reproducing the hint for real means running a gaming VPN with the game for three minutes, which
// is awkward to stage on purpose. In a dev build these expose it on the browser console (open the
// dev webview's devtools). You must be in a session lobby for the banner to have somewhere to
// render:
//   betterfleet.interceptor.offer()           : show the banner right now
//   betterfleet.interceptor.simulateBlind()   : feed the watchdog "game socketless, no server" so
//                                               the hint fires through the real 3min path; pass
//                                               false to stop
if (import.meta.env.DEV && typeof window !== "undefined") {
  const scope = window as unknown as { betterfleet?: Record<string, unknown> };
  scope.betterfleet = {
    ...(scope.betterfleet ?? {}),
    interceptor: {
      offer: () => {
        interceptorHint.visible = true;
      },
      simulateBlind: (on = true) => {
        devForceBlind = on;
      },
    },
  };
  console.info(
    "[BetterFleet] dev: betterfleet.interceptor.offer() shows the VPN-interceptor banner now; " +
      "betterfleet.interceptor.simulateBlind() drives it through the real 3min path.",
  );
}
