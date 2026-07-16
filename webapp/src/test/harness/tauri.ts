/**
 * The Tauri/Rust side of the harness.
 *
 * The webview's HTTP, logging and `invoke` bridges only exist inside a running Tauri shell, and the
 * Rust layer (game detection) has no browser equivalent at all — so importing anything that touches
 * them explodes under vitest. These are the stand-ins.
 *
 * Use from a spec, before importing the code under test:
 *
 *   vi.mock("@tauri-apps/api/http", async () => (await import("@/test/harness/tauri.ts")).httpMock());
 *   vi.mock("tauri-plugin-log-api", async () => (await import("@/test/harness/tauri.ts")).logMock());
 *   vi.mock("@tauri-apps/api/tauri", async () => (await import("@/test/harness/tauri.ts")).invokeMock());
 *   vi.mock("@/main.ts", async () => (await import("@/test/harness/tauri.ts")).mainMock());
 *   vi.mock("@/objects/stores/LoginStates.ts", async () => (await import("@/test/harness/tauri.ts")).keycloakMock());
 */
import {
  fakeBackend,
  FakeWebSocket,
  FakeEventSource,
} from "@/test/harness/FakeBackend.ts";

/** Alerts the app raised, so a test can assert what the user was actually told. */
export const sentAlerts: { title: string; content: string; type: unknown }[] =
  [];

/** Commands the frontend sent to Rust, so a test can assert the game-detection bridge. */
export const rustCalls: { command: string; args: unknown }[] = [];

/** Whatever the Rust layer should answer, keyed by command name. */
export const rustResponses = new Map<string, unknown>();

export function httpMock() {
  return {
    ResponseType: { JSON: 1, Text: 2, Binary: 3 },
    fetch: (url: string, options?: unknown) =>
      fakeBackend.fetch(url, options as never),
    Body: { json: (v: unknown) => v },
  };
}

export function logMock() {
  return {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
    trace: () => {},
  };
}

export function invokeMock() {
  return {
    invoke: async (command: string, args?: unknown) => {
      rustCalls.push({ command, args });
      return rustResponses.get(command) ?? null;
    },
  };
}

export function mainMock() {
  return {
    alertProvider: {
      sendAlert: (alert: { title: string; content: string; type: unknown }) => {
        sentAlerts.push(alert);
      },
    },
    i18n: undefined,
  };
}

export function keycloakMock() {
  return {
    keycloakStore: {
      keycloak: {
        token: "test-token",
        updateToken: async () => false,
        logout: () => {},
      },
      init: () => {},
    },
  };
}

/**
 * Points the global WebSocket/EventSource at the fake backend and clears every recorder. Call from
 * beforeEach: without the reset, one test's sockets keep answering the next one's.
 */
export function installFakeTransports(): void {
  fakeBackend.reset();
  sentAlerts.length = 0;
  rustCalls.length = 0;
  rustResponses.clear();
  (globalThis as any).WebSocket = FakeWebSocket;
  (globalThis as any).EventSource = FakeEventSource;
}
