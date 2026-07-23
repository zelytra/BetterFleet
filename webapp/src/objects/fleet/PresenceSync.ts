import { invoke } from "@tauri-apps/api/tauri";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { Player } from "@/objects/fleet/Player.ts";

// Discord Rich Presence (#684). The frontend owns WHAT to show — the session state it already
// knows — and Rust owns the IPC. English on purpose: a presence is read by other people, whose
// language the player's setting says nothing about.

export interface PresencePayload {
  state: string;
  details: string;
  startEpoch: number | null;
}

/**
 * The presence for the current player state, or null when nothing should show (feature off, no
 * session). Private sessions never expose their code — and a fresh fleet is private-by-default
 * until the first server UPDATE, so a code can never flash early.
 */
export function buildPresence(
  player: Player,
  joinedAtEpoch: number | null,
): PresencePayload | null {
  if (player.richPresence === false) return null;
  const fleet = player.fleet;
  if (!fleet?.sessionId) return null;

  const ready = fleet.players.filter((member) => member.isReady).length;
  const total = fleet.players.length;
  const state = player.countDown
    ? "Countdown — raising anchors!"
    : "Lobby — " + ready + "/" + total + " ready";
  const details = fleet.isPrivate
    ? "Private session"
    : "Session " + fleet.sessionId.toUpperCase();
  return { state, details, startEpoch: joinedAtEpoch };
}

let timer: number | undefined;
let lastSent = "";
let joinedAt: number | null = null;

/**
 * Started once by the main window. Every 5s the presence is rebuilt and pushed only when it
 * changed — leaving a session (or turning the setting off) clears it within a tick.
 */
export function startPresenceSync(): void {
  if (timer !== undefined) return;
  timer = window.setInterval(() => {
    const player = UserStore.player as Player;
    const inSession = !!player.fleet?.sessionId;
    if (inSession && joinedAt === null) {
      joinedAt = Math.floor(Date.now() / 1000);
    }
    if (!inSession) {
      joinedAt = null;
    }

    const payload = buildPresence(player, joinedAt);
    const key = payload ? JSON.stringify(payload) : "clear";
    if (key === lastSent) return;
    lastSent = key;

    if (payload) {
      invoke("update_presence", {
        state: payload.state,
        details: payload.details,
        startEpoch: payload.startEpoch,
      }).catch(() => {});
    } else {
      invoke("clear_presence").catch(() => {});
    }
  }, 5000) as unknown as number;
}
