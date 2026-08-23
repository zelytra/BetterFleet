import { describe, it, expect, beforeEach, vi } from "vitest";

// happy-dom exposes a working localStorage on the Node majors CI runs; on bleeding-edge Node the
// global is Node's own stub, which stays undefined without --localstorage-file. The module under
// test persists the refresh token through the bare global, so when it is absent, stand in an
// in-memory Storage. Inert wherever a real localStorage already exists.
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() {
        return store.size;
      },
    } as Storage,
  });
}

// BrowserAuth drives the system browser + loopback sign-in every platform now uses, so its edges
// are all Tauri plugins: the loopback server (plugin-oauth), the browser opener (plugin-shell) and
// the Rust-side HTTP client (plugin-http). Stub the three and record what crosses each one.

/** Every token-endpoint style request BrowserAuth issued, so a test can assert the OIDC contract. */
const httpCalls: { url: string; body: URLSearchParams }[] = [];
/** The next responses to hand back, in order. Empty means respond 200 with `tokenResponse`; an
 *  entry with `reject` makes the fetch itself throw, like an unreachable Keycloak. */
let httpQueue: {
  ok: boolean;
  status: number;
  payload: unknown;
  reject?: boolean;
}[] = [];
const tokenResponse = {
  access_token: "at",
  refresh_token: "rt-rotated",
  id_token: "idt",
  expires_in: 60,
};

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: async (url: string, options: { body: string }) => {
    httpCalls.push({ url, body: new URLSearchParams(options.body) });
    const next = httpQueue.shift() ?? {
      ok: true,
      status: 200,
      payload: tokenResponse,
    };
    if (next.reject) throw new Error("network unreachable");
    return {
      ok: next.ok,
      status: next.status,
      json: async () => next.payload,
      text: async () => JSON.stringify(next.payload),
    };
  },
}));

/** What the fake loopback captured: the registered onUrl callback, and cancel() calls. */
let capturedOnUrl: ((url: string) => void) | null = null;
const cancelledPorts: number[] = [];
/** The HTML the loopback server was told to serve once the redirect lands. */
let servedPage = "";
/** Ports the fake loopback refuses to bind, as a busy machine would. */
const busyPorts = new Set<number>();
vi.mock("@fabianlars/tauri-plugin-oauth", () => ({
  start: async (config: { ports: number[]; response?: string }) => {
    servedPage = config.response ?? "";
    const free = config.ports.find((port) => !busyPorts.has(port));
    if (free === undefined) throw new Error("EADDRINUSE");
    return free;
  },
  onUrl: async (cb: (url: string) => void) => {
    capturedOnUrl = cb;
    return () => {
      capturedOnUrl = null;
    };
  },
  cancel: async (port: number) => {
    cancelledPorts.push(port);
  },
}));

/** The authorize URLs opened in the system browser. */
const openedUrls: string[] = [];
vi.mock("@tauri-apps/plugin-shell", () => ({
  open: async (url: string) => {
    openedUrls.push(url);
  },
}));

// The success page reads the app's own messages now, so the real i18n instance is used: mocking it
// would hide the very thing these tests check.
import { tsi18n } from "@/objects/i18n";

import {
  login,
  abort,
  restore,
  endSession,
  forget,
  accessTokenExpiry,
  usernameFromIdToken,
  LoginAbortedError,
  RefreshUnavailableError,
  PortUnavailableError,
} from "@/objects/stores/BrowserAuth.ts";

const REFRESH_KEY = "kc-refresh-token";
const LEGACY_REFRESH_KEY = "kc-linux-refresh-token";

/** An unsigned JWT carrying the given claims (signature irrelevant: BrowserAuth never verifies). */
function jwt(claims: Record<string, unknown>): string {
  const encode = (obj: unknown) =>
    btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "none" })}.${encode(claims)}.sig`;
}

/** base64url(SHA-256(input)), the S256 transform Keycloak applies to check the PKCE binding. */
async function s256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

beforeEach(() => {
  vi.stubEnv("VITE_KEYCLOAK_HOST", "http://kc.test/auth");
  localStorage.clear();
  httpCalls.length = 0;
  httpQueue = [];
  openedUrls.length = 0;
  cancelledPorts.length = 0;
  capturedOnUrl = null;
  servedPage = "";
  busyPorts.clear();
  tsi18n.global.locale.value = "en";
});

describe("accessTokenExpiry", () => {
  it("reads exp as epoch milliseconds", () => {
    expect(accessTokenExpiry(jwt({ exp: 1_700_000_000 }))).toBe(
      1_700_000_000_000,
    );
  });

  it("returns 0 when exp is missing or the token is not a JWT", () => {
    expect(accessTokenExpiry(jwt({ sub: "abc" }))).toBe(0);
    expect(accessTokenExpiry("not-a-jwt")).toBe(0);
    expect(accessTokenExpiry("")).toBe(0);
  });
});

describe("usernameFromIdToken", () => {
  it("prefers preferred_username, falls back to name", () => {
    expect(
      usernameFromIdToken(jwt({ preferred_username: "gold_hoarder" })),
    ).toBe("gold_hoarder");
    expect(usernameFromIdToken(jwt({ name: "Captain Flameheart" }))).toBe(
      "Captain Flameheart",
    );
  });

  it("decodes multi-byte usernames as UTF-8", () => {
    expect(usernameFromIdToken(jwt({ preferred_username: "Éloïse哈哈" }))).toBe(
      "Éloïse哈哈",
    );
  });

  it("returns an empty string for a malformed token", () => {
    expect(usernameFromIdToken("garbage")).toBe("");
  });
});

describe("restore", () => {
  it("answers null without a network call when nothing is stored", async () => {
    expect(await restore()).toBeNull();
    expect(httpCalls).toHaveLength(0);
  });

  it("trades the stored refresh token and persists the rotated one", async () => {
    localStorage.setItem(REFRESH_KEY, "rt-old");
    const tokens = await restore();
    expect(tokens).toEqual(tokenResponse);
    expect(httpCalls).toHaveLength(1);
    expect(httpCalls[0].url).toBe(
      "http://kc.test/auth/realms/Betterfleet/protocol/openid-connect/token",
    );
    expect(httpCalls[0].body.get("grant_type")).toBe("refresh_token");
    expect(httpCalls[0].body.get("refresh_token")).toBe("rt-old");
    expect(httpCalls[0].body.get("client_id")).toBe("application");
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-rotated");
  });

  it("migrates a pre-unification Linux token to the current key", async () => {
    // Linux players signed in before the rename hold the old key; reading it must move it forward,
    // not sign them out.
    localStorage.setItem(LEGACY_REFRESH_KEY, "rt-linux");
    const tokens = await restore();
    expect(tokens).toEqual(tokenResponse);
    expect(httpCalls[0].body.get("refresh_token")).toBe("rt-linux");
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-rotated");
    expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
  });

  it("keeps the stored token when Keycloak cannot be reached", async () => {
    // The distinction the whole flow rests on: an unreachable server says nothing about the
    // session, so deleting the token here would turn a Wi-Fi blip into a full browser re-login.
    localStorage.setItem(REFRESH_KEY, "rt-live");
    httpQueue.push({ ok: false, status: 0, payload: {}, reject: true });
    await expect(restore()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-live");
  });

  it("keeps the stored token when Keycloak answers 5xx", async () => {
    // A restarting Keycloak, or a proxy 502: the server is failing, not judging the session.
    localStorage.setItem(REFRESH_KEY, "rt-live");
    httpQueue.push({ ok: false, status: 503, payload: {} });
    await expect(restore()).rejects.toBeInstanceOf(RefreshUnavailableError);
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-live");
  });

  it("clears the stored token and answers null when Keycloak rejects it", async () => {
    localStorage.setItem(REFRESH_KEY, "rt-expired");
    httpQueue.push({ ok: false, status: 400, payload: {} });
    expect(await restore()).toBeNull();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });
});

describe("login", () => {
  it("runs the loopback code+PKCE exchange and persists the refresh token", async () => {
    const pending = login();
    // The browser is open once the authorize URL has been handed to plugin-shell.
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    const authorize = new URL(openedUrls[0]);
    expect(
      authorize.href.startsWith("http://kc.test/auth/realms/Betterfleet"),
    ).toBe(true);
    expect(authorize.searchParams.get("client_id")).toBe("application");
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "http://localhost:47823/callback",
    );
    // offline_access is the whole point of going cross-platform: the refresh token outlives
    // Keycloak's SSO Session Max, so the session no longer dies after ~10h mid-play.
    expect(authorize.searchParams.get("scope")).toBe("openid offline_access");
    expect(authorize.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorize.searchParams.get("code_challenge")).toBeTruthy();
    expect(authorize.searchParams.get("prompt")).toBe("login");

    // Play the browser redirect hitting the loopback.
    const state = authorize.searchParams.get("state")!;
    capturedOnUrl!(
      `http://localhost:47823/callback?state=${state}&code=auth-code`,
    );

    const tokens = await pending;
    expect(tokens).toEqual(tokenResponse);
    expect(httpCalls).toHaveLength(1);
    expect(httpCalls[0].body.get("grant_type")).toBe("authorization_code");
    expect(httpCalls[0].body.get("code")).toBe("auth-code");
    // The verifier sent to the token endpoint must hash to the challenge from the authorize URL:
    // this is the PKCE binding Keycloak enforces, so a broken S256 computation must fail here, not
    // only against the real server.
    const sentVerifier = httpCalls[0].body.get("code_verifier")!;
    expect(await s256(sentVerifier)).toBe(
      authorize.searchParams.get("code_challenge"),
    );
    expect(localStorage.getItem(REFRESH_KEY)).toBe("rt-rotated");
    // The loopback listener is released for the next attempt.
    expect(cancelledPorts).toContain(47823);
  });

  it("serves the browser success page in the player's language", async () => {
    // The page is the last thing a player sees before coming back to the app: it has to speak the
    // language they chose, not the five the flow used to carry.
    tsi18n.global.locale.value = "ja";
    const pending = login();
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    expect(servedPage).toContain('lang="ja"');
    expect(servedPage).toContain("ログインに成功しました");
    expect(servedPage).toContain("BetterFleet に戻ってください");

    const state = new URL(openedUrls[0]).searchParams.get("state")!;
    capturedOnUrl!(`http://localhost:47823/callback?state=${state}&code=c`);
    await pending;
  });

  it("falls back to English for a locale the app does not carry", async () => {
    // "source" is the translator-facing copy and never a language a player runs in; anything
    // unknown must not reach the <html lang> attribute either.
    tsi18n.global.locale.value = "source";
    const pending = login();
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    expect(servedPage).toContain('lang="en"');
    expect(servedPage).toContain("You can close this tab");

    const state = new URL(openedUrls[0]).searchParams.get("state")!;
    capturedOnUrl!(`http://localhost:47823/callback?state=${state}&code=c`);
    await pending;
  });

  it("falls back to the next port when the first is taken", async () => {
    // 47823 sits inside Linux's ephemeral range, so an unrelated program can be holding it - and
    // this is now the only way anyone signs in. The redirect URI must follow the port that bound,
    // or Keycloak sends the code to a listener that does not exist.
    busyPorts.add(47823);
    const pending = login();
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    const authorize = new URL(openedUrls[0]);
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      "http://localhost:47824/callback",
    );

    const state = authorize.searchParams.get("state")!;
    capturedOnUrl!(`http://localhost:47824/callback?state=${state}&code=c`);
    await pending;
    // The token exchange has to repeat the same redirect_uri, or Keycloak rejects the code.
    expect(httpCalls[0].body.get("redirect_uri")).toBe(
      "http://localhost:47824/callback",
    );
    // And the listener that actually bound is the one released.
    expect(cancelledPorts).toContain(47824);
  });

  it("reports a busy range as its own failure, not a generic one", async () => {
    // The one sign-in failure a player can fix themselves, so the caller must be able to tell it
    // apart and say so.
    busyPorts.add(47823);
    busyPorts.add(47824);
    busyPorts.add(47825);
    await expect(login()).rejects.toBeInstanceOf(PortUnavailableError);
    expect(openedUrls).toHaveLength(0);
  });

  it("rejects a callback whose state does not match", async () => {
    const pending = login();
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    capturedOnUrl!(
      "http://localhost:47823/callback?state=forged&code=auth-code",
    );
    await expect(pending).rejects.toThrow("state mismatch");
    // State is validated before anything else happens with the callback: no token exchange may
    // have been issued for the forged code, and nothing may be persisted.
    expect(httpCalls).toHaveLength(0);
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
  });

  it("abort() rejects the pending login and frees the loopback port", async () => {
    const pending = login();
    await vi.waitFor(() => {
      expect(openedUrls).toHaveLength(1);
    });
    await abort();
    await expect(pending).rejects.toBeInstanceOf(LoginAbortedError);
    // Two cancels, not one: abort() frees the port directly (its reason to exist - teardown before
    // login()'s finally gets to run), and login()'s finally releases it again on the way out. Down
    // to one means abort() lost its direct cancel and only the finally is doing the work.
    expect(cancelledPorts.filter((port) => port === 47823)).toHaveLength(2);
  });
});

describe("endSession", () => {
  it("revokes the stored refresh token against the logout endpoint", async () => {
    localStorage.setItem(REFRESH_KEY, "rt-live");
    await endSession();
    expect(httpCalls).toHaveLength(1);
    expect(httpCalls[0].url).toBe(
      "http://kc.test/auth/realms/Betterfleet/protocol/openid-connect/logout",
    );
    expect(httpCalls[0].body.get("refresh_token")).toBe("rt-live");
  });

  it("does nothing when signed out, and swallows an unreachable Keycloak", async () => {
    await endSession();
    expect(httpCalls).toHaveLength(0);

    localStorage.setItem(REFRESH_KEY, "rt-live");
    httpQueue.push({ ok: false, status: 503, payload: {}, reject: true });
    // The fetch itself throws (Keycloak unreachable) and endSession swallows it: the local
    // sign-out must proceed anyway.
    await expect(endSession()).resolves.toBeUndefined();
    expect(httpCalls).toHaveLength(1);
  });
});

describe("forget", () => {
  it("clears the current and legacy stored tokens", () => {
    localStorage.setItem(REFRESH_KEY, "a");
    localStorage.setItem(LEGACY_REFRESH_KEY, "b");
    forget();
    expect(localStorage.getItem(REFRESH_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_REFRESH_KEY)).toBeNull();
  });
});
