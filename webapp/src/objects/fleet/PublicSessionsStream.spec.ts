import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@tauri-apps/api/core", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";
import { fakeBackend } from "@/test/harness/FakeBackend.ts";
import { installFakeTransports } from "@/test/harness/tauri.ts";

/** Pretend the app is served from `protocol` (the webview is https on Windows, http under jsdom). */
function forceProtocol(protocol: string): () => void {
  const spy = vi
    .spyOn(window, "location", "get")
    .mockReturnValue({ protocol } as Location);
  return () => spy.mockRestore();
}

// The live SSE stream is the one call that leaves through the webview's EventSource rather than Rust,
// so it is subject to mixed content: an https app cannot open an http backend. connectStream must skip
// the doomed attempt (and just poll) exactly then, and keep using the stream everywhere else.
describe("PublicSessionsStore SSE mixed-content guard", () => {
  beforeEach(() => installFakeTransports());
  afterEach(() => {
    PublicSessionsStore.disconnect();
    vi.unstubAllEnvs();
  });

  it("opens the stream when app and backend share the http scheme", () => {
    vi.stubEnv("VITE_BACKEND_HOST", "http://127.0.0.1:8080");
    const restore = forceProtocol("http:");
    try {
      PublicSessionsStore.connectStream();
      expect(fakeBackend.streams).toHaveLength(1);
    } finally {
      restore();
    }
  });

  it("skips the stream when an https app would open an http backend", () => {
    vi.stubEnv("VITE_BACKEND_HOST", "http://127.0.0.1:8080");
    const restore = forceProtocol("https:");
    try {
      PublicSessionsStore.connectStream();
      expect(fakeBackend.streams).toHaveLength(0); // mixed content -> poll only, no error
    } finally {
      restore();
    }
  });

  it("opens the stream for an https backend from an https app", () => {
    vi.stubEnv("VITE_BACKEND_HOST", "https://betterfleet.fr/api");
    const restore = forceProtocol("https:");
    try {
      PublicSessionsStore.connectStream();
      expect(fakeBackend.streams).toHaveLength(1); // https end to end, not mixed content
    } finally {
      restore();
    }
  });
});

// The stream is meant to make the 5s poll idle. In production it never did: the gate skipped a tick
// only if a frame had arrived within the last POLL_INTERVAL_MS, and the backend had no heartbeat -
// so at steady state the "fallback" ran at full cadence and became 96% of all API traffic over 14
// days (#839). The gate is now stream liveness (readyState + a tolerance window), and the backend
// heartbeats every 3s to feed it.
describe("PublicSessionsStore poll suppression (#839)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeTransports();
    vi.stubEnv("VITE_BACKEND_HOST", "http://127.0.0.1:8080");
  });
  afterEach(() => {
    PublicSessionsStore.disconnect();
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  function pollCount(): number {
    return fakeBackend.requests.filter((u) => u.endsWith("/public-sessions"))
      .length;
  }

  it("stays silent while the stream heartbeats", async () => {
    const restore = forceProtocol("http:");
    try {
      PublicSessionsStore.connectStream();
      const stream = fakeBackend.streams[0];
      // Three minutes of a healthy stream: the backend beats every 3s, nothing else happens.
      for (let i = 0; i < 60; i++) {
        stream.push(JSON.stringify({ connectedPlayers: 0, sessions: [] }));
        await vi.advanceTimersByTimeAsync(3000);
      }
      expect(pollCount()).toBe(0);
    } finally {
      restore();
    }
  });

  it("takes over when the stream goes quiet without dropping", async () => {
    // A stream wedged open by a proxy past a dead backend: readyState still OPEN, no frames. The
    // poll must resume - this is the half that readyState alone would miss.
    const restore = forceProtocol("http:");
    try {
      PublicSessionsStore.connectStream();
      fakeBackend.streams[0].push(
        JSON.stringify({ connectedPlayers: 0, sessions: [] }),
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect(pollCount()).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("takes over the moment the stream drops, without waiting out the tolerance", async () => {
    const restore = forceProtocol("http:");
    try {
      PublicSessionsStore.connectStream();
      const stream = fakeBackend.streams[0];
      stream.push(JSON.stringify({ connectedPlayers: 0, sessions: [] }));
      stream.drop(); // connection lost; the client still holds the object
      await vi.advanceTimersByTimeAsync(6000);
      expect(pollCount()).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("does not trust a fresh frame from a stream that has since dropped", async () => {
    // The case frame recency alone gets wrong, and the reason the gate reads readyState: the
    // connection died a moment after its last frame, so by the old rule the stream still looked
    // healthy for a further five seconds and the list silently froze.
    const restore = forceProtocol("http:");
    try {
      PublicSessionsStore.connectStream();
      const stream = fakeBackend.streams[0];
      // Just before the poll tick at 5s: a frame, then the drop.
      await vi.advanceTimersByTimeAsync(4900);
      stream.push(JSON.stringify({ connectedPlayers: 0, sessions: [] }));
      stream.drop();
      // The tick lands with the last frame 100ms old - fresh by any recency rule, and useless.
      await vi.advanceTimersByTimeAsync(200);
      expect(pollCount()).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });

  it("polls when there is no stream at all", async () => {
    // Mixed content, or a backend without SSE: the poll is the only path and must run.
    const restore = forceProtocol("https:");
    try {
      PublicSessionsStore.connectStream();
      expect(fakeBackend.streams).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(pollCount()).toBeGreaterThan(0);
    } finally {
      restore();
    }
  });
});
