import { reactive } from "vue";
import { error, info } from "@tauri-apps/plugin-log";
import { fetchReleaseNotes, simplifyReleaseNotes } from "@/objects/WhatsNew.ts";

// In-app auto-update (restores the behaviour lost in the Tauri v1 -> v2 migration, #735: v1's
// updater auto-checked at boot via `active`/`dialog`, but v2's plugin never checks on its own and
// no code called it, so every v2 client stopped receiving updates). This checks once at startup;
// if a newer release is published it surfaces an "update available" button in the header, and the
// player downloads-and-installs on demand from the update modal, matching v1's consented dialog
// rather than a silent swap.
//
// The tauri-apps/plugin-updater and plugin-process modules are imported dynamically inside the
// functions, so merely importing this file (the header does) pulls no native plugin into the
// bundle and this no-ops cleanly outside the desktop shell (a browser, the vitest harness) instead
// of throwing "plugin not found".

export type UpdateStatus =
  | "idle" // no update, or not checked yet
  | "available" // a newer version is published
  | "downloading" // download in progress
  | "installing"; // installed; relaunch imminent

export const UpdateStore = reactive({
  status: "idle" as UpdateStatus,
  /** The newer version (no leading "v"), once one is found. */
  version: "",
  /** Release notes as short lines, or null when they could not be loaded (offline / rate limit). */
  notes: null as string[] | null,
  /** Bytes downloaded and the total, for the progress bar; total is 0 until the server reports it. */
  downloaded: 0,
  total: 0,
  /** Delivery failed (download or install threw); the modal offers the manual releases link. */
  failed: false,
  /** Drives the update modal, opened from the header button. */
  modalOpen: false,
});

// The plugin's Update handle: kept out of the reactive store (it is a class instance with methods,
// not state) and consumed once by the install step.
let pendingUpdate: { downloadAndInstall: DownloadAndInstall } | null = null;

type DownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };
type DownloadAndInstall = (
  onEvent: (event: DownloadEvent) => void,
) => Promise<void>;

/** True only inside the Tauri desktop shell; false in a plain browser or under vitest. */
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The lines the modal shows for a release: the notes fetched from GitHub, else the body the updater
 * manifest itself carries (latest.json's `notes`), simplified the same way, else null. Pure, so the
 * fallback order is unit-tested without the network.
 */
export function resolveNotes(
  fetched: string[] | null,
  manifestBody: string | undefined,
): string[] | null {
  if (fetched && fetched.length) return fetched;
  if (manifestBody) {
    const lines = simplifyReleaseNotes(manifestBody);
    return lines.length ? lines : null;
  }
  return null;
}

/**
 * Checks GitHub for a newer release once, at startup. Never blocks and never throws out: any
 * failure (offline, plugin missing off-desktop, malformed manifest) is logged and leaves the store
 * idle, so the app boots identically whether or not an update exists.
 */
export async function checkForUpdate(): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) {
      info("[Updater] up to date");
      return;
    }
    pendingUpdate = update as unknown as {
      downloadAndInstall: DownloadAndInstall;
    };
    const version = String(update.version ?? "").replace(/^v/i, "");
    const fetched = version ? await fetchReleaseNotes(version) : null;
    UpdateStore.version = version;
    UpdateStore.notes = resolveNotes(fetched, update.body);
    UpdateStore.status = "available";
    info("[Updater] update available: v" + version);
  } catch (e) {
    error("[Updater] update check failed: " + e);
  }
}

/**
 * Downloads and installs the pending update, tracking progress, then relaunches. On any failure the
 * store is flagged failed (the modal falls back to the manual releases link) and the app is left
 * running untouched - a broken update must never break the app.
 */
export async function downloadAndInstallUpdate(): Promise<void> {
  if (!pendingUpdate || UpdateStore.status === "downloading") return;
  UpdateStore.failed = false;
  UpdateStore.downloaded = 0;
  UpdateStore.total = 0;
  UpdateStore.status = "downloading";
  try {
    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === "Started") {
        UpdateStore.total = event.data.contentLength ?? 0;
      } else if (event.event === "Progress") {
        UpdateStore.downloaded += event.data.chunkLength;
      }
    });
    UpdateStore.status = "installing";
    info("[Updater] installed, relaunching");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    error("[Updater] update delivery failed: " + e);
    UpdateStore.failed = true;
    UpdateStore.status = "available";
  }
}

// Dev-only handle to preview the update modal without publishing a release, mirroring the
// betterfleet.recap/detection dev handles. Stripped from production builds.
if (import.meta.env.DEV && typeof window !== "undefined") {
  const w = window as unknown as { betterfleet?: Record<string, unknown> };
  w.betterfleet = w.betterfleet ?? {};
  w.betterfleet.update = {
    preview(version = "9.9.9") {
      UpdateStore.version = version;
      UpdateStore.notes = [
        "feat: preview of the update modal",
        "fix: this is dev-only sample copy",
      ];
      UpdateStore.failed = false;
      UpdateStore.status = "available";
      UpdateStore.modalOpen = true;
    },
  };
}
