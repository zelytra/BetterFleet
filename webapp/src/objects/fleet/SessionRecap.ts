import { reactive } from "vue";
// Type-only: keeps this module (and its spec) from pulling Fleet's WebSocket/HTTP runtime chain.
import type { Player } from "@/objects/fleet/Player.ts";
import type { SotServer } from "@/objects/fleet/SotServer.ts";
import type { Fleet } from "@/objects/fleet/Fleet.ts";

// Shareable session recap (#685). When an alliance forms — two or more players group onto one
// server — a dismissable card celebrates it (the biggest group, if the fleet split across servers).
// The decision logic is pure and fed the fleet state, so the "once per convergence, debounced, not
// mid-countdown" rules are unit-testable without timers, exactly like the detection watchdog (#688).

/** Convergence must hold this long before the card shows, so a flickering grouping doesn't fire it early. */
export const RECAP_DEBOUNCE_MS = 4000;

/**
 * The server the alliance formed on — the **biggest** grouping, when it holds two or more players
 * (#685). A lone player is not a solo alliance; but the whole fleet need not land on one server, so a
 * crew split 5+5 across two servers still counts — the largest group is the one the card celebrates.
 * Mirrors the backend's `largestGroup >= 2`.
 */
export function convergedServer(
  servers: Map<string, SotServer>,
): SotServer | null {
  let biggest: SotServer | null = null;
  for (const server of servers.values()) {
    const count = server.connectedPlayers?.length ?? 0;
    if (
      count >= 2 &&
      (biggest === null || count > biggest.connectedPlayers.length)
    ) {
      biggest = server;
    }
  }
  return biggest;
}

/**
 * Fires true exactly once per convergence, after it has held for {@link RECAP_DEBOUNCE_MS}. A
 * countdown holds the offer rather than consuming it (the card would step on the launch ritual), and
 * losing convergence re-arms it for the next one.
 */
export class RecapWatchdog {
  private convergedSince: number | null = null;
  private fired = false;

  observe(
    converged: boolean,
    countdownRunning: boolean,
    nowMs: number,
  ): boolean {
    if (!converged) {
      // The alliance broke up (or never formed): reset the debounce and re-arm for a fresh one.
      this.convergedSince = null;
      this.fired = false;
      return false;
    }
    if (countdownRunning) {
      // Converged but launching: keep the clock, just don't pop the card mid-countdown.
      return false;
    }
    if (this.convergedSince === null) {
      this.convergedSince = nowMs;
    }
    if (!this.fired && nowMs - this.convergedSince >= RECAP_DEBOUNCE_MS) {
      this.fired = true;
      return true;
    }
    return false;
  }
}

export interface SessionRecap {
  tries: number;
  players: number;
  durationMs: number;
  /** Lowercase ISO country of the converged server, when geolocation has resolved it. */
  countryCode?: string;
}

/** Snapshots the win: tries so far, head count, time since this client joined, server region. */
export function buildRecap(
  fleet: Fleet,
  server: SotServer,
  startedAtMs: number,
  nowMs: number,
): SessionRecap {
  return {
    tries: Math.max(0, fleet.stats?.tryAmount ?? 0),
    // The head-count on the converged server, matching the backend's — not the whole fleet, since a
    // straggler may still be detecting.
    players: server.connectedPlayers.length,
    durationMs: Math.max(0, nowMs - startedAtMs),
    countryCode: server.countryCode || undefined,
  };
}

/** Milliseconds → a neutral "M:SS" stopwatch string, so no unit needs translating. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes + ":" + String(seconds).padStart(2, "0");
}

/** ISO 3166-1 alpha-2 → its flag emoji (regional-indicator pair), or "" when unknown. */
export function countryFlagEmoji(countryCode?: string): string {
  if (
    !countryCode ||
    countryCode.length !== 2 ||
    !/^[a-zA-Z]{2}$/.test(countryCode)
  ) {
    return "";
  }
  const base = 0x1f1e6;
  const cc = countryCode.toUpperCase();
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}

/** What the lobby renders: the card flips visible when the watchdog fires, false on dismiss. */
export const sessionRecap = reactive({
  visible: false,
  data: null as SessionRecap | null,
});

const watchdog = new RecapWatchdog();
// When this client first sees itself in a session — the honest client-side start of "duration".
let startedAtMs: number | null = null;

/** Called from the game poll: one observation per tick, off the live fleet state. */
export function observeConvergence(player: Player, nowMs = Date.now()): void {
  const fleet = player.fleet;
  if (!fleet?.sessionId) {
    // Not in a session: forget the clock and reset the watchdog so the next session starts clean.
    startedAtMs = null;
    watchdog.observe(false, false, nowMs);
    sessionRecap.visible = false;
    sessionRecap.data = null;
    return;
  }
  if (startedAtMs === null) {
    startedAtMs = nowMs;
  }
  const server = convergedServer(fleet.servers);
  const fired = watchdog.observe(
    server !== null,
    player.countDown !== undefined,
    nowMs,
  );
  // The watchdog still runs (its once-per-convergence state stays honest), but a player who turned
  // the card off in the settings never sees it (#685). Absent means shown; only an explicit false hides.
  if (fired && server && player.recapCard !== false) {
    sessionRecap.data = buildRecap(fleet, server, startedAtMs, nowMs);
    sessionRecap.visible = true;
  }
}

export function dismissRecap(): void {
  sessionRecap.visible = false;
}

// --- Dev-only preview handle (removed from production builds) -------------------------------------
// Staging a real convergence (a crew of two landing on one server) to see the card is a hassle, so a
// dev build exposes it on the console. Open the lobby, then call it:
//   betterfleet.recap.show()                       — sample card (4 pirates, 2 tries, 2:45, 🇫🇷)
//   betterfleet.recap.show(3, 1, 40, "us")         — your own numbers (players, tries, seconds, cc)
if (import.meta.env.DEV && typeof window !== "undefined") {
  const scope = window as unknown as { betterfleet?: Record<string, unknown> };
  scope.betterfleet = {
    ...(scope.betterfleet ?? {}),
    recap: {
      show: (players = 4, tries = 2, durationSec = 165, countryCode = "fr") => {
        sessionRecap.data = {
          players,
          tries,
          durationMs: durationSec * 1000,
          countryCode,
        };
        sessionRecap.visible = true;
      },
    },
  };
  console.info(
    "[BetterFleet] dev: betterfleet.recap.show() previews the alliance-formed card.",
  );
}
