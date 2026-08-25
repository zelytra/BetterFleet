import { describe, expect, it } from "vitest";
import {
  CaptureRepairWatchdog,
  REPAIR_BANNER_AFTER_MS,
} from "@/objects/fleet/CaptureRepairWatchdog.ts";

// The repair banner's timing rules (#819): show only when an unhealthy state HOLDS, clear the
// moment the service answers again, and never fire for the elevated stopgap.

describe("CaptureRepairWatchdog", () => {
  const t0 = 1_000_000;

  it("stays quiet while the service is healthy", () => {
    const watchdog = new CaptureRepairWatchdog();
    expect(watchdog.observe("ok", t0)).toBeNull();
    expect(watchdog.observe("ok", t0 + REPAIR_BANNER_AFTER_MS * 2)).toBeNull();
  });

  it("does not flash on a transient unhealthy reading", () => {
    const watchdog = new CaptureRepairWatchdog();
    expect(watchdog.observe("service-unreachable", t0)).toBeNull();
    expect(
      watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS - 1),
    ).toBeNull();
    // The service came back (e.g. restarted by an update) before the debounce ran out.
    expect(watchdog.observe("ok", t0 + REPAIR_BANNER_AFTER_MS)).toBeNull();
  });

  it("fires once the unhealthy state has held past the debounce", () => {
    const watchdog = new CaptureRepairWatchdog();
    watchdog.observe("service-unreachable", t0);
    expect(
      watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS),
    ).toBe("service-unreachable");
    // And keeps reporting while it lasts - the banner is persistent, not a one-shot.
    expect(
      watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS * 3),
    ).toBe("service-unreachable");
  });

  it("clears itself the moment the service answers again", () => {
    const watchdog = new CaptureRepairWatchdog();
    watchdog.observe("service-unreachable", t0);
    watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS);
    expect(watchdog.observe("ok", t0 + REPAIR_BANNER_AFTER_MS + 1)).toBeNull();
    // A later relapse starts a fresh debounce instead of firing instantly.
    expect(
      watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS + 2),
    ).toBeNull();
  });

  it("a change of reason does NOT restart the debounce - badness is continuous", () => {
    const watchdog = new CaptureRepairWatchdog();
    watchdog.observe("service-unreachable", t0);
    // The failure changes shape just before firing (service back up but version-skewed): the
    // service has been broken the whole time, so the banner fires on the original schedule,
    // with the current reason.
    expect(
      watchdog.observe("service-incompatible", t0 + REPAIR_BANNER_AFTER_MS - 1),
    ).toBeNull();
    expect(
      watchdog.observe("service-incompatible", t0 + REPAIR_BANNER_AFTER_MS),
    ).toBe("service-incompatible");
  });

  it("an already-showing banner survives a reason flip, updating its text", () => {
    const watchdog = new CaptureRepairWatchdog();
    watchdog.observe("service-unreachable", t0);
    expect(
      watchdog.observe("service-unreachable", t0 + REPAIR_BANNER_AFTER_MS),
    ).toBe("service-unreachable");
    // The SCM brings a skewed binary back up: still broken, banner must not blink off.
    expect(
      watchdog.observe(
        "service-incompatible",
        t0 + REPAIR_BANNER_AFTER_MS + 3000,
      ),
    ).toBe("service-incompatible");
  });

  it("a crash-looping service flapping between the two bad states still fires", () => {
    const watchdog = new CaptureRepairWatchdog();
    // Alternating reasons every ~3s, as a crash loop produces: unreachable while restarting,
    // incompatible when up. The banner must arm on schedule regardless.
    let result: string | null = null;
    for (let tick = 0; tick * 3000 <= REPAIR_BANNER_AFTER_MS; tick++) {
      result = watchdog.observe(
        tick % 2 === 0 ? "service-unreachable" : "service-incompatible",
        t0 + tick * 3000,
      );
    }
    expect(result).not.toBeNull();
  });

  it("never fires for the elevated stopgap", () => {
    const watchdog = new CaptureRepairWatchdog();
    watchdog.observe("degraded-elevated", t0);
    expect(
      watchdog.observe("degraded-elevated", t0 + REPAIR_BANNER_AFTER_MS * 2),
    ).toBeNull();
  });
});
