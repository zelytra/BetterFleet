import { describe, it, expect, vi } from "vitest";

// Importing the module pulls HTTPAxios -> keycloak -> main.ts, none of which exists under vitest;
// the harness stand-ins cut that chain (same pattern as every other spec here).
vi.mock("@tauri-apps/api/http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import {
  AllianceStatsPayload,
  bestWindow,
  computeHint,
} from "@/objects/fleet/AllianceHint.ts";

// The lobby hint (#683) must never mislead: it hides below the sample floor, groups the backend's
// tied-top hours into one window, and converts to local time through an injected seam.

function payload(
  overrides: Partial<AllianceStatsPayload> = {},
): AllianceStatsPayload {
  return {
    totalAttempts: 500,
    converged: 200,
    convergenceRate: 0.4,
    averageTries: 2.5,
    heatmap: [],
    bestHours: [],
    minSample: 30,
    ...overrides,
  };
}

/** One pooled hour spread over a single weekday — enough for the hour-pooling the hint does. */
function cell(hour: number, attempts: number, converged: number) {
  return {
    dayOfWeek: 1,
    hour,
    attempts,
    converged,
    rate: converged / attempts,
  };
}

describe("bestWindow", () => {
  it("groups consecutive tied hours into one run", () => {
    expect(bestWindow([5, 6, 7])).toEqual({ start: 5, end: 8 });
  });

  it("wraps across midnight", () => {
    expect(bestWindow([23, 0, 1])).toEqual({ start: 23, end: 2 });
  });

  it("picks the longest run when several exist", () => {
    expect(bestWindow([3, 10, 11, 12])).toEqual({ start: 10, end: 13 });
  });

  it("yields nothing for no data or a meaningless full circle", () => {
    expect(bestWindow([])).toBeNull();
    expect(bestWindow(Array.from({ length: 24 }, (_, h) => h))).toBeNull();
  });
});

describe("computeHint", () => {
  const identity = (h: number) => h;

  it("builds the range, the best rate and the current rate", () => {
    const hint = computeHint(
      payload({
        bestHours: [5, 6],
        heatmap: [cell(5, 60, 40), cell(6, 50, 30), cell(18, 100, 20)],
      }),
      18,
      identity,
    );
    expect(hint).toEqual({
      localRange: "05:00–07:00",
      bestRate: 67,
      nowRate: 20,
    });
  });

  it("drops the current rate when its sample is too thin", () => {
    const hint = computeHint(
      payload({
        bestHours: [5],
        heatmap: [cell(5, 60, 40), cell(18, 10, 2)],
      }),
      18,
      identity,
    );
    expect(hint?.nowRate).toBeNull();
    expect(hint?.bestRate).toBe(67);
  });

  it("hides entirely when the best hour itself lacks sample or data is absent", () => {
    expect(
      computeHint(
        payload({ bestHours: [5], heatmap: [cell(5, 10, 9)] }),
        5,
        identity,
      ),
    ).toBeNull();
    expect(computeHint(null, 5, identity)).toBeNull();
    expect(
      computeHint(payload({ heatmap: [cell(1, 50, 10)] }), 5, identity),
    ).toBeNull();
  });

  it("converts the window through the injected local clock", () => {
    const plusTwo = (h: number) => (h + 2) % 24;
    const hint = computeHint(
      payload({ bestHours: [23], heatmap: [cell(23, 40, 30)] }),
      3,
      plusTwo,
    );
    expect(hint?.localRange).toBe("01:00–02:00");
  });
});
