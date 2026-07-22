import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@tauri-apps/api/http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@tauri-apps/api/tauri", async () =>
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
