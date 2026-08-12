import { afterEach, describe, expect, it, vi } from "vitest";

// The poll backoff (#803): repeated refresh failures must widen the retry gap instead of hammering
// a fixed 5s cadence forever, and one success must snap the cadence back.

let failing = true;
let fetchCalls = 0;

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: async () => {
    fetchCalls += 1;
    if (failing) throw new Error("HTTP 503");
    return {
      ok: true,
      status: 200,
      json: async () => ({ sessions: [], connectedPlayers: 0 }),
      text: async () => "",
    };
  },
}));
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";

describe("PublicSessionsStore poll backoff (#803)", () => {
  afterEach(() => {
    PublicSessionsStore.disconnect();
    vi.useRealTimers();
  });

  it("doubles the retry gap on consecutive failures and recovers on success", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    failing = true;
    fetchCalls = 0;

    PublicSessionsStore.connectStream(); // EventSource is absent under vitest; the poll carries it

    // t=5s: first attempt fails -> backoff 10s (next allowed at 15s).
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchCalls).toBe(1);

    // t=10s: still backing off, the tick must not fire a request.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchCalls).toBe(1);

    // t=15s: second attempt fails -> backoff 20s (next allowed at 35s).
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchCalls).toBe(2);

    // t=20..30s: gated.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchCalls).toBe(2);

    // t=35s: third attempt - now let it succeed, which must reset the cadence.
    failing = false;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchCalls).toBe(3);

    // Normal 5s cadence resumed: two more ticks, two more requests.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchCalls).toBe(5);
  });
});
