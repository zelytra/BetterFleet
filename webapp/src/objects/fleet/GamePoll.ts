import { invoke } from "@tauri-apps/api/core";
import { warn } from "@tauri-apps/plugin-log";
import { Utils } from "@/objects/utils/Utils.ts";
import { syncGameState } from "@/objects/fleet/GameSync.ts";
import { observeDetection } from "@/objects/fleet/DetectionWatchdog.ts";
import { observeSocketless } from "@/objects/fleet/SocketlessWatchdog.ts";
import { observeCaptureHealth } from "@/objects/fleet/CaptureRepairWatchdog.ts";
import { observeConvergence } from "@/objects/fleet/SessionRecap.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import type { Player } from "@/objects/fleet/Player.ts";
import type { Fleet } from "@/objects/fleet/Fleet.ts";
import type { RustSotServer } from "@/objects/fleet/SotServer.ts";

// One tick of the 400ms game poll, extracted from FleetMenuNavigator so its failure behaviour is
// a testable contract (#859): the interval used to call invoke().then(...) bare, so any IPC
// hiccup became an unhandled rejection two and a half times per second.

/** How often a failing poll is worth a log line. At 400ms per tick, unthrottled logging would
 *  write ~150 identical lines a minute into the log a support report ships. */
const FAILURE_LOG_INTERVAL_MS = 30_000;
let lastFailureLoggedAt = 0;

/** One poll: read the Rust game object, sync the store, feed every watchdog. Never rejects -
 *  the interval fires this fire-and-forget, so a rejection here would be unhandled. */
export async function pollGameTick(): Promise<void> {
  try {
    await pollGameTickInner();
  } catch (e) {
    const now = Date.now();
    if (now - lastFailureLoggedAt >= FAILURE_LOG_INTERVAL_MS) {
      lastFailureLoggedAt = now;
      void warn("[GamePoll] game poll failed (throttled log): " + e);
    }
  }
}

async function pollGameTickInner(): Promise<void> {
  const response: any = await invoke("get_game_object");
  const rustSotServer: RustSotServer = {
    status: Utils.parseRustPlayerStatus(response.status),
    ip: response.ip,
    port: response.port,
    noUdpCycles: response.noUdpCycles ?? 0,
  };
  syncGameState(
    rustSotServer,
    UserStore.player as Player,
    UserStore.player.fleet as Fleet,
  );
  // Guided diagnostic (#688): the same poll feeds the silent-detection watchdog.
  observeDetection(UserStore.player as Player);
  // Socketless watchdog (report id 801): raises the #688 diagnostic offer when the game runs
  // with no visible UDP sockets for minutes. Neutral by design: no cause is asserted.
  observeSocketless(rustSotServer, UserStore.player as Player);
  // Capture-repair watchdog (#819): the unelevated GUI cannot capture without the service, so
  // a missing or version-skewed service must become a banner with a next step, never silence.
  // performance.now() because the debounce must survive wall-clock steps (NTP, DST, manual).
  observeCaptureHealth(response.captureHealth ?? "ok", performance.now());
  // Shareable recap (#685): and the convergence watchdog behind the "alliance formed" card.
  observeConvergence(UserStore.player as Player);
}
