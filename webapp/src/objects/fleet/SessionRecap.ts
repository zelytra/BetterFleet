import { reactive } from "vue";
// Type-only: keeps this module (and its spec) from pulling Fleet's WebSocket/HTTP runtime chain.
import type { Player } from "@/objects/fleet/Player.ts";
import type { SotServer } from "@/objects/fleet/SotServer.ts";
import type { Fleet } from "@/objects/fleet/Fleet.ts";

// Shareable session recap (#685). When the alliance converges — everyone lands on ONE detected
// server — a dismissable card celebrates it and offers a Discord-ready line to paste. The decision
// logic is pure and fed the fleet state, so the "once per convergence, debounced, not mid-countdown"
// rules are unit-testable without timers, exactly like the detection watchdog (#688).

/** Convergence must hold this long before the card shows, so a flickering grouping doesn't fire it early. */
export const RECAP_DEBOUNCE_MS = 4000;

/**
 * The single server everyone sits on, or null if the fleet hasn't converged. Mirrors the backend's
 * `distinctServers === 1` convergence (#673): exactly one populated server, and nobody the session
 * knows is left ungrouped.
 */
export function convergedServer(
  players: Player[],
  servers: Map<string, SotServer>,
): SotServer | null {
  if (players.length === 0) return null;
  const populated = Array.from(servers.values()).filter(
    (server) => (server.connectedPlayers?.length ?? 0) > 0,
  );
  if (populated.length !== 1) return null;
  const server = populated[0];
  const onServer = new Set(server.connectedPlayers.map((p) => p.username));
  const everyone = players.every((p) => onServer.has(p.username));
  return everyone ? server : null;
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
    players: fleet.players.length,
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

/** The Discord-ready line: aggregate numbers only, no usernames. */
export function buildShareText(
  recap: SessionRecap,
  t: (key: string, params?: Record<string, unknown>) => string,
): string {
  const flag = countryFlagEmoji(recap.countryCode);
  return t("session.recap.share", {
    players: recap.players,
    tries: recap.tries,
    duration: formatClock(recap.durationMs),
    region: flag ? " " + flag : "",
  });
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
  const server = convergedServer(fleet.players, fleet.servers);
  const fired = watchdog.observe(
    server !== null,
    player.countDown !== undefined,
    nowMs,
  );
  if (fired && server) {
    sessionRecap.data = buildRecap(fleet, server, startedAtMs, nowMs);
    sessionRecap.visible = true;
  }
}

export function dismissRecap(): void {
  sessionRecap.visible = false;
}
