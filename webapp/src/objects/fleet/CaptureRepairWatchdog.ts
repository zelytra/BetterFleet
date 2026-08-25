import { reactive } from "vue";

// Capture-repair watchdog (#819). On Windows the GUI runs unelevated and CANNOT capture without
// the BetterFleetCapture service: if the service is missing, stopped, quarantined by an antivirus
// or version-skewed, detection is dead - not degraded - and saying nothing would be exactly the
// silent failure the Linux helper design avoids. So the Rust side reports a capture-health state
// with every game poll, and this watchdog turns it into a persistent banner with a real next step
// ("re-run the installer"). The banner clears ITSELF the moment the service answers again; there
// is deliberately no dismiss, because while it shows, server detection genuinely does not work.
//
// Debounced, like the other watchdogs: a transient unhealthy reading (service restarting after an
// update, a slow first answer at boot) must not flash a repair banner. The decision logic is a
// pure class fed by the existing game poll, mirroring SocketlessWatchdog, so the timing rules are
// unit-testable without timers.

/** Health states the Rust side reports (GameObject.captureHealth). */
export type CaptureHealth =
  "ok" | "service-unreachable" | "service-incompatible" | "degraded-elevated";

/** The states that mean "detection is dead and the player can fix it". `degraded-elevated` is
 *  deliberately NOT one of them: the elevated stopgap works, and nagging the one player who
 *  followed the support advice would be counterproductive. */
export type RepairReason = "service-unreachable" | "service-incompatible";

/** How long an unhealthy state must hold before the banner shows. Long enough to swallow a
 *  service restart during an app update and the first slow answer after boot. */
export const REPAIR_BANNER_AFTER_MS = 30_000;

/** What the banner renders. Reactive singleton, same shape as detectionPrompt. */
export const captureRepair = reactive({
  reason: null as RepairReason | null,
});

export class CaptureRepairWatchdog {
  private badSince: number | null = null;
  private badReason: RepairReason | null = null;

  /**
   * Feeds one health observation; returns the repair reason to display, or null for no banner.
   * The debounce measures CONTINUOUS badness, not continuous same-reason badness: a service
   * flapping between "unreachable" (restarting) and "incompatible" (up but skewed) has been
   * broken the whole time, and restarting the clock on each flip would suppress the banner
   * forever - or hide an already-showing one - during exactly the failure it exists for
   * (#819 review). Only a healthy reading resets the clock; the reason label just tracks the
   * latest bad state.
   */
  observe(health: CaptureHealth, nowMs: number): RepairReason | null {
    if (health !== "service-unreachable" && health !== "service-incompatible") {
      this.badSince = null;
      this.badReason = null;
      return null;
    }
    this.badReason = health;
    if (this.badSince === null) {
      this.badSince = nowMs;
    }
    if (nowMs - this.badSince >= REPAIR_BANNER_AFTER_MS) {
      return this.badReason;
    }
    return null;
  }
}

const watchdog = new CaptureRepairWatchdog();

/** Called from the game poll: one observation per tick. */
export function observeCaptureHealth(
  health: CaptureHealth,
  nowMs: number,
): void {
  captureRepair.reason = watchdog.observe(health, nowMs);
}
