import { beforeEach, describe, expect, it, vi } from "vitest";

// The session store is now hand-rolled (keycloak-js is gone), and the piece that matters most is
// ensureFresh: it decides whether a failed refresh ends the player's session or is merely a blip.
// Getting that wrong is a sign-out mid-play, so it is pinned here rather than left to the auth
// screen. BrowserAuth is stubbed - the OIDC wire itself is covered by BrowserAuth.spec.ts.

// vi.mock factories are hoisted above the file body, so everything they close over has to be
// hoisted too - including the stub error class the tests assert on.
const stub = vi.hoisted(() => {
  class StubRefreshUnavailableError extends Error {}
  return {
    StubRefreshUnavailableError,
    /** What the stubbed BrowserAuth.restore() should do on its next call. */
    behaviour: { restore: async (): Promise<unknown> => null },
    endSessionCalls: [] as number[],
    forgetCalls: [] as number[],
  };
});

const StubRefreshUnavailableError = stub.StubRefreshUnavailableError;

vi.mock("@/objects/stores/BrowserAuth.ts", () => ({
  restore: () => stub.behaviour.restore(),
  login: async () => ({
    access_token: "at",
    refresh_token: "rt",
    id_token: "idt",
    expires_in: 60,
  }),
  endSession: async () => void stub.endSessionCalls.push(1),
  forget: () => void stub.forgetCalls.push(1),
  usernameFromIdToken: () => "gold_hoarder",
  // Far in the future by default, so ensureFresh only refreshes when a test asks for it.
  accessTokenExpiry: () => Date.now() + 3_600_000,
  LoginAbortedError: class extends Error {},
  RefreshUnavailableError: stub.StubRefreshUnavailableError,
}));

// The store logs restore failures through the Tauri log plugin, which has no host under vitest.
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);

vi.mock("@/main.ts", () => ({
  alertProvider: { sendAlert: () => undefined },
  i18n: { global: { locale: { value: "en" } } },
}));

import { keycloakStore } from "@/objects/stores/LoginStates.ts";

/** Signs the store in, the way a completed login or restore does. */
function signIn() {
  keycloakStore.applyTokens({
    access_token: "at",
    refresh_token: "rt",
    id_token: "idt",
    expires_in: 60,
  });
}

beforeEach(() => {
  stub.behaviour.restore = async () => null;
  stub.endSessionCalls.length = 0;
  stub.forgetCalls.length = 0;
  keycloakStore.reset();
});

describe("ensureFresh", () => {
  it("does not refresh while the access token is still comfortably valid", async () => {
    signIn();
    let called = false;
    stub.behaviour.restore = async () => {
      called = true;
      return null;
    };
    // The default stubbed expiry is an hour out, well past the 60s the caller asks for.
    await expect(keycloakStore.ensureFresh(60)).resolves.toBe(false);
    expect(called).toBe(false);
  });

  it("signs the player out when Keycloak rejects the refresh token", async () => {
    signIn();
    stub.behaviour.restore = async () => null; // definitive: the session is over
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).rejects.toThrow("OIDC session expired");
    expect(keycloakStore.keycloak.authenticated).toBe(false);
    expect(keycloakStore.isAuthenticated).toBe(false);
    expect(keycloakStore.keycloak.token).toBeUndefined();
  });

  it("keeps the session signed in when Keycloak could not be reached", async () => {
    // The regression this exists for: an unreachable Keycloak says nothing about the session, so a
    // 20-second network drop must not cost the player a full browser re-login. The caller still
    // sees the rejection (and drops its stale bearer), but the store stays signed in.
    signIn();
    stub.behaviour.restore = async () => {
      throw new StubRefreshUnavailableError("offline");
    };
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(StubRefreshUnavailableError);
    expect(keycloakStore.keycloak.authenticated).toBe(true);
    expect(keycloakStore.isAuthenticated).toBe(true);
  });

  it("recovers on a later attempt once the network is back", async () => {
    signIn();
    stub.behaviour.restore = async () => {
      throw new StubRefreshUnavailableError("offline");
    };
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(StubRefreshUnavailableError);

    stub.behaviour.restore = async () => ({
      access_token: "at2",
      refresh_token: "rt2",
      id_token: "idt2",
      expires_in: 60,
    });
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).resolves.toBe(true);
    expect(keycloakStore.keycloak.token).toBe("at2");
    expect(keycloakStore.isAuthenticated).toBe(true);
  });

  it("shares one refresh between concurrent callers", async () => {
    // The 1s poll and any in-flight request can ask at the same moment; each firing its own token
    // call would race to overwrite the stored refresh token.
    signIn();
    let calls = 0;
    stub.behaviour.restore = async () => {
      calls += 1;
      return {
        access_token: "at2",
        refresh_token: "rt2",
        id_token: "idt2",
        expires_in: 60,
      };
    };
    const [a, b, c] = await Promise.all([
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ]);
    expect([a, b, c]).toEqual([true, true, true]);
    expect(calls).toBe(1);
  });

  it("does not wedge after a failure: the in-flight slot is released", async () => {
    signIn();
    stub.behaviour.restore = async () => {
      throw new StubRefreshUnavailableError("offline");
    };
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(StubRefreshUnavailableError);
    // A second attempt must actually call again rather than await a promise that already settled.
    let called = false;
    stub.behaviour.restore = async () => {
      called = true;
      throw new StubRefreshUnavailableError("still offline");
    };
    await expect(
      keycloakStore.ensureFresh(Number.MAX_SAFE_INTEGER),
    ).rejects.toBeInstanceOf(StubRefreshUnavailableError);
    expect(called).toBe(true);
  });
});

describe("restoreSession", () => {
  it("settles isReady even when Keycloak is unreachable", async () => {
    // isReady is what the auth screen waits on; if a failure left it false the player would sit on
    // a blank screen with no way to sign in.
    stub.behaviour.restore = async () => {
      throw new StubRefreshUnavailableError("offline");
    };
    await keycloakStore.restoreSession();
    expect(keycloakStore.isReady).toBe(true);
    expect(keycloakStore.isAuthenticated).toBe(false);
  });

  it("signs the player in when a stored session comes back", async () => {
    stub.behaviour.restore = async () => ({
      access_token: "at",
      refresh_token: "rt",
      id_token: "idt",
      expires_in: 60,
    });
    await keycloakStore.restoreSession();
    expect(keycloakStore.isReady).toBe(true);
    expect(keycloakStore.isAuthenticated).toBe(true);
    expect(keycloakStore.user.username).toBe("gold_hoarder");
  });
});
