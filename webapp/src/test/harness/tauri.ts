/**
 * The Tauri/Rust side of the harness.
 *
 * The webview's HTTP, logging and `invoke` bridges only exist inside a running Tauri shell, and the
 * Rust layer (game detection) has no browser equivalent at all, so importing anything that touches
 * them explodes under vitest. These are the stand-ins.
 *
 * Use from a spec, before importing the code under test:
 *
 *   vi.mock("@tauri-apps/plugin-http", async () => (await import("@/test/harness/tauri.ts")).httpMock());
 *   vi.mock("@tauri-apps/plugin-log", async () => (await import("@/test/harness/tauri.ts")).logMock());
 *   vi.mock("@tauri-apps/api/core", async () => (await import("@/test/harness/tauri.ts")).invokeMock());
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
  // v2 `@tauri-apps/plugin-http` exposes only a WHATWG-shaped `fetch`; the v1 `ResponseType`/`Body`
  // helpers are gone. The fake returns a Response-like object (see FakeBackend.fetch).
  return {
    fetch: (url: string, options?: unknown) =>
      fakeBackend.fetch(url, options as never),
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
      isAuthenticated: false,
      // Mirrors the real store's shape so UserStore.init(), which reads keycloakStore.user.username,
      // can run under the harness.
      user: { username: "tester" },
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

// --- Tauri event bus + window, for the in-game overlay (#671) ------------------------------------
// The overlay is a second Tauri window fed over `@tauri-apps/api/event`, and toggled through
// `@tauri-apps/api/webviewWindow`. Neither exists under vitest, so these are in-memory stand-ins: `emit`
// delivers synchronously to every `listen` for that event (so a main->overlay round-trip resolves in
// one tick), and the recorder lets a test assert what crossed the window boundary.

type EventListener = (event: { payload: unknown }) => void;
const eventListeners = new Map<string, Set<EventListener>>();
/** Every payload emitted since the last reset, so a test can assert what was pushed. */
export const emittedEvents: { event: string; payload: unknown }[] = [];

export function eventMock() {
  return {
    emit: async (event: string, payload?: unknown) => {
      emittedEvents.push({ event, payload });
      for (const cb of [...(eventListeners.get(event) ?? [])]) cb({ payload });
    },
    listen: async (event: string, cb: EventListener) => {
      const set = eventListeners.get(event) ?? new Set<EventListener>();
      set.add(cb);
      eventListeners.set(event, set);
      return () => set.delete(cb);
    },
  };
}

/** A stand-in overlay window whose visibility a test can read and drive. */
export const fakeOverlayWindow = {
  visible: false,
  async show() {
    fakeOverlayWindow.visible = true;
  },
  async hide() {
    fakeOverlayWindow.visible = false;
  },
  async isVisible() {
    return fakeOverlayWindow.visible;
  },
};

let currentWindowLabel = "main";
/** Pretend the code is running in the window with this label (drives isOverlayWindow()). */
export function setCurrentWindowLabel(label: string): void {
  currentWindowLabel = label;
}

export function windowMock() {
  return {
    // v2: the current window comes from getCurrentWebviewWindow(), and getByLabel is async.
    getCurrentWebviewWindow: () => ({
      get label() {
        return currentWindowLabel;
      },
    }),
    WebviewWindow: {
      getByLabel: async (label: string) =>
        label === "overlay" ? fakeOverlayWindow : null,
    },
  };
}

/** Clears emitted events + window state. Pass true to also drop every registered listener. */
export function resetTauriEvents(dropListeners = false): void {
  emittedEvents.length = 0;
  fakeOverlayWindow.visible = false;
  currentWindowLabel = "main";
  if (dropListeners) eventListeners.clear();
}
