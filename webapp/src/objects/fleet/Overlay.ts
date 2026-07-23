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
// Overlay -> main: the local player clicked their ready badge in the overlay.
const TOGGLE_READY_EVENT = "overlay:toggle-ready";

/** The built-in toggle accelerator, in Tauri syntax — what main.rs binds before any preference. */
export const DEFAULT_OVERLAY_HOTKEY = "CommandOrControl+Shift+O";

/** Human-readable form of an accelerator for the overlay header ("Ctrl+Shift+O"). */
export function hotkeyLabel(accelerator?: string): string {
  return (accelerator ?? DEFAULT_OVERLAY_HOTKEY).replace(
    "CommandOrControl",
    "Ctrl",
  );
}

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
  /** The local player, always present so the overlay can show their ready state even off a server. */
  me: OverlayPlayer;
  /** Human-readable toggle combo for the header — follows the player's rebind (#687). */
  hotkeyLabel: string;
  servers: OverlayServer[];
  /**
   * Session players no detected server holds yet, local player first. Keeps the whole roster
   * visible — everyone appears with their ready state even before their server is found.
   */
  unassigned: OverlayPlayer[];
  /**
   * ISO time-of-day at which the launch countdown ends (player.countDown.clickTime), or null when no
   * countdown is running. The overlay ticks its own local timer from this so the display stays smooth
   * without the main window streaming every frame — and, unlike the app, it plays no sound.
   */
  countdownEndsAt: string | null;
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

  // Only servers someone is actually on; biggest grouping first so the useful one leads.
  const populated = (fleet ? Array.from(fleet.servers.values()) : [])
    .filter((s) => (s.connectedPlayers?.length ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.connectedPlayers?.length ?? 0) - (a.connectedPlayers?.length ?? 0),
    );

  // Whoever the session knows but no grouping holds — the rest of the roster stays visible too.
  const assigned = new Set(
    populated.flatMap((s) => (s.connectedPlayers ?? []).map((p) => p.username)),
  );
  const unassigned = (fleet?.players ?? [])
    .filter((p) => !assigned.has(p.username))
    .map((p) => ({
      username: p.username,
      isReady: !!p.isReady,
      isSelf: p.username === player.username,
    }))
    // Local player first: their row carries the ready toggle and must stay in reach.
    .sort((a, b) => Number(b.isSelf) - Number(a.isSelf));

  return {
    locale: player.lang ?? "en",
    inSession: !!fleet?.sessionId,
    me: {
      username: player.username,
      isReady: !!player.isReady,
      isSelf: true,
    },
    hotkeyLabel: hotkeyLabel(player.overlayHotkey),
    countdownEndsAt: player.countDown?.clickTime
      ? player.countDown.clickTime.toString()
      : null,
    servers: populated.map((s) => ({
      hash: s.hash ?? "",
      countryCode: (s.countryCode ?? "").toLowerCase(),
      color: s.color ?? "",
      players: (s.connectedPlayers ?? []).map((p) => ({
        username: p.username,
        isReady: !!p.isReady,
        isSelf: p.username === player.username,
      })),
    })),
    unassigned,
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
  // The overlay can't touch the session socket (separate webview): it asks us to flip the ready state.
  await listen(TOGGLE_READY_EVENT, () => applyToggleReady());
  info("[Overlay] broadcaster started");
}

/**
 * Runs in the MAIN window on the overlay's request: flips the local player's ready state exactly the
 * way the in-app button does (mutate then push to the session), then echoes a fresh snapshot so the
 * overlay reflects it immediately instead of waiting for the next poll.
 */
function applyToggleReady(): void {
  const player = UserStore.player;
  player.isReady = !player.isReady;
  player.fleet?.updateToSession();
  emit(UPDATE_EVENT, computeSnapshot()).catch(() => {});
}

/** Called by the OVERLAY window when the local player clicks their ready badge. */
export function requestToggleReady(): void {
  emit(TOGGLE_READY_EVENT).catch(() => {});
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

/** Shows or hides the overlay window. Bound to the settings checkbox (the hotkey lives in Rust). */
export async function setOverlayVisible(visible: boolean): Promise<void> {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  if (!overlay) {
    error("[Overlay] window not found");
    return;
  }
  try {
    if (visible) {
      await overlay.show();
      emit(UPDATE_EVENT, computeSnapshot()).catch(() => {});
    } else {
      await overlay.hide();
    }
  } catch (e) {
    error("[Overlay] visibility change failed: " + e);
  }
}

/** Current visibility of the overlay window, so the settings checkbox can reflect the real state. */
export async function isOverlayVisible(): Promise<boolean> {
  const overlay = WebviewWindow.getByLabel(OVERLAY_LABEL);
  try {
    return overlay ? await overlay.isVisible() : false;
  } catch {
    return false;
  }
}
