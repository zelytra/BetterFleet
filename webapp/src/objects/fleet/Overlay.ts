import { appWindow, WebviewWindow } from "@tauri-apps/api/window";
import { emit, listen, UnlistenFn } from "@tauri-apps/api/event";
import {
  isRegistered,
  register,
  unregister,
} from "@tauri-apps/api/globalShortcut";
import { info, error } from "tauri-plugin-log-api";
import { UserStore } from "@/objects/stores/UserStore.ts";

// In-game overlay (issue #671). A second, always-on-top Tauri window (label "overlay", declared in
// tauri.conf.json, hidden at startup) shows the player their own server and the session's biggest
// server. It is a separate webview with its own JS context, so the MAIN window is the single source
// of truth and pushes a compact snapshot over a Tauri event; the overlay only listens and renders.

const OVERLAY_LABEL = "overlay";
const UPDATE_EVENT = "overlay:update";
const REQUEST_EVENT = "overlay:request";
export const OVERLAY_HOTKEY = "CommandOrControl+Shift+O";

export interface OverlayServer {
  hash?: string;
  address: string; // ip:port, "" when unresolved
  color: string;
  players: number;
}

export interface OverlaySnapshot {
  status: string;
  inSession: boolean;
  myServer: OverlayServer | null;
  biggestServer: OverlayServer | null;
}

/** True when the current window is the overlay (so main.ts can route it to the overlay view). */
export function isOverlayWindow(): boolean {
  try {
    return appWindow.label === OVERLAY_LABEL;
  } catch {
    return false;
  }
}

// Structural shape (just the fields the overlay shows), so it accepts both a fleet SotServer and
// the raw detected server without wrestling with the recursive SotServer/Player types.
function toOverlayServer(
  server: { ip: string; port: number; hash?: string; color: string },
  players: number,
): OverlayServer {
  return {
    hash: server.hash,
    address: server.ip ? `${server.ip}:${server.port}` : "",
    color: server.color,
    players,
  };
}

/** Computes the compact snapshot the overlay renders from the live fleet/player state. */
export function computeSnapshot(): OverlaySnapshot {
  const player = UserStore.player;
  const fleet = player.fleet;
  const servers = fleet ? Array.from(fleet.servers.values()) : [];

  // My server: the authoritative one from the fleet (it carries the player count), matched on
  // ip:port; fall back to the raw detected server (count 0) if the fleet hasn't echoed it yet.
  let myServer: OverlayServer | null = null;
  if (player.server && player.server.ip) {
    const mine = servers.find(
      (s) => s.ip === player.server!.ip && s.port === player.server!.port,
    );
    myServer = mine
      ? toOverlayServer(mine, mine.connectedPlayers?.length ?? 0)
      : toOverlayServer(player.server, 0);
  }

  let biggestServer: OverlayServer | null = null;
  if (servers.length) {
    const biggest = servers.reduce((a, b) =>
      (b.connectedPlayers?.length ?? 0) > (a.connectedPlayers?.length ?? 0)
        ? b
        : a,
    );
    biggestServer = toOverlayServer(
      biggest,
      biggest.connectedPlayers?.length ?? 0,
    );
  }

  return {
    status: player.status,
    inSession: !!fleet?.sessionId,
    myServer,
    biggestServer,
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

/** Shows/hides the overlay window. Bound to the toggle button and the global hotkey. */
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

/** Registers the global toggle hotkey (main window). Safe to call once at startup. */
export async function registerOverlayHotkey(): Promise<void> {
  try {
    if (!(await isRegistered(OVERLAY_HOTKEY))) {
      await register(OVERLAY_HOTKEY, () => {
        toggleOverlay();
      });
      info("[Overlay] hotkey registered: " + OVERLAY_HOTKEY);
    }
  } catch (e) {
    error("[Overlay] hotkey registration failed: " + e);
  }
}

export async function unregisterOverlayHotkey(): Promise<void> {
  try {
    await unregister(OVERLAY_HOTKEY);
  } catch {
    /* ignore */
  }
}
