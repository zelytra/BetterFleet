import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import { info, error } from "tauri-plugin-log-api";
import { UserStore } from "@/objects/stores/UserStore.ts";

// In-game overlay (issue #671). A second, always-on-top Tauri window (label "overlay", declared in
// tauri.conf.json, hidden at startup) mirrors the live session: every server grouping with the
// pirates on it and their ready state. It is a separate webview with its own JS context, so the MAIN
// window is the single source of truth and pushes a compact snapshot over a Tauri event; the overlay
// only listens and renders. The global toggle hotkey is owned by the Rust side (main.rs), which
// proved far more reliable than the JS global-shortcut API.

const OVERLAY_LABEL = "overlay";
const UPDATE_EVENT = "overlay:update";
const REQUEST_EVENT = "overlay:request";

/** Human-readable label of the toggle hotkey registered in main.rs, shown in the overlay header. */
export const OVERLAY_HOTKEY_LABEL = "Ctrl+Shift+O";

export interface OverlayPlayer {
  username: string;
  isReady: boolean;
  /** The local player, so the overlay can pick their row out of the grouping. */
  isSelf: boolean;
}

export interface OverlayServer {
  hash: string;
  /** Lowercase ISO country of the server region, "" when not resolved. Drives the region flag. */
  countryCode: string;
  color: string;
  players: OverlayPlayer[];
}

export interface OverlaySnapshot {
  /** The main window's active language, so the overlay renders in the player's tongue. */
  locale: string;
  inSession: boolean;
  servers: OverlayServer[];
}

/** True when the current window is the overlay (so main.ts can route it to the overlay view). */
export function isOverlayWindow(): boolean {
  try {
    return appWindow.label === OVERLAY_LABEL;
  } catch {
    return false;
  }
}

/** Computes the compact snapshot the overlay renders from the live fleet/player state. */
export function computeSnapshot(): OverlaySnapshot {
  const player = UserStore.player;
  const fleet = player.fleet;
  const servers = fleet ? Array.from(fleet.servers.values()) : [];

  return {
    locale: player.lang ?? "en",
    inSession: !!fleet?.sessionId,
    servers: servers
      // Only servers someone is actually on; biggest grouping first so the useful one leads.
      .filter((s) => (s.connectedPlayers?.length ?? 0) > 0)
      .sort(
        (a, b) =>
          (b.connectedPlayers?.length ?? 0) - (a.connectedPlayers?.length ?? 0),
      )
      .map((s) => ({
        hash: s.hash ?? "",
        countryCode: (s.countryCode ?? "").toLowerCase(),
        color: s.color ?? "",
        players: (s.connectedPlayers ?? []).map((p) => ({
          username: p.username,
          isReady: !!p.isReady,
          isSelf: p.username === player.username,
        })),
      })),
  };
}

let broadcasting = false;
/**
 * Started by the MAIN window: pushes the snapshot to the overlay. Polls once a second (the snapshot
 * is tiny) so the overlay stays fresh regardless of how the fleet mutates, and answers an explicit
 * request the overlay sends when it opens.
 */
export async function startOverlayBroadcaster(): Promise<void> {
  if (broadcasting) return;
  broadcasting = true;
  setInterval(() => {
    emit(UPDATE_EVENT, computeSnapshot()).catch(() => {});
  }, 1000);
  await listen(REQUEST_EVENT, () => {
    emit(UPDATE_EVENT, computeSnapshot()).catch(() => {});
  });
  info("[Overlay] broadcaster started");
}

/** Subscribed by the OVERLAY window: asks for the current state, then follows updates. */
export async function onOverlayUpdate(
  callback: (snapshot: OverlaySnapshot) => void,
): Promise<UnlistenFn> {
  const unlisten = await listen<OverlaySnapshot>(UPDATE_EVENT, (event) =>
    callback(event.payload),
  );
  emit(REQUEST_EVENT).catch(() => {});
  return unlisten;
}

/** Shows/hides the overlay window. Bound to the in-app toggle button (the hotkey lives in Rust). */
export async function toggleOverlay(): Promise<void> {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) {
    error("[Overlay] window not found");
    return;
  }
  try {
    if (await overlay.isVisible()) {
      await overlay.hide();
    } else {
      await overlay.show();
      emit(UPDATE_EVENT, computeSnapshot()).catch(() => {});
    }
  } catch (e) {
    error("[Overlay] toggle failed: " + e);
  }
}
