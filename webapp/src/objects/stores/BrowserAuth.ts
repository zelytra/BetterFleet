import { start, onUrl, cancel } from "@fabianlars/tauri-plugin-oauth";
import { open } from "@tauri-apps/plugin-shell";
import { fetch } from "@tauri-apps/plugin-http";
// The TypeScript-side i18n instance (the same one alerts raised outside components use). Not the
// app instance from main.ts: this module is imported by the auth store, and going through main.ts
// would drag the whole app bootstrap into that graph.
import { tsi18n } from "@/objects/i18n";

// Loopback OIDC — the sign-in flow on every platform. This is the RFC 8252 native-app pattern:
// open the hosted Keycloak login in the system browser with an `http://localhost:<port>` redirect,
// capture the code with a tiny local server (`tauri-plugin-oauth`), and run the PKCE token exchange
// from Rust through `plugin-http` so the webview never makes the cross-origin call (no CORS against
// its custom-scheme origin).
//
// It began as the Linux-only path (#740): WebKitGTK's `tauri://localhost` origin cannot be an OAuth
// redirect target (Keycloak refuses non-HTTP(S) schemes). It is now the flow everywhere because the
// in-webview keycloak-js login Windows/macOS used instead had no refresh token that outlived
// Keycloak's SSO Session Max (10h) — sessions silently died mid-play (#803/#805) — and because
// RFC 8252 §8.12 discourages embedded-webview logins outright. Here the `offline_access` refresh
// token survives restarts and slides its own 30-day idle window on every refresh.

// Fixed loopback port, so the redirect URI to register in Keycloak is a single exact string:
//   Valid redirect URIs -> http://localhost:47823/callback
const REDIRECT_PORT = 47823;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const REALM = "Betterfleet";
const CLIENT_ID = "application";
// The refresh token is persisted so login survives a restart (the desktop equivalent of the SSO
// cookie the in-webview flow relied on before the loopback flow went cross-platform).
const REFRESH_KEY = "kc-refresh-token";
// Pre-unification Linux builds stored the token under this key; readers migrate it forward so the
// rename does not sign existing Linux players out.
const LEGACY_REFRESH_KEY = "kc-linux-refresh-token";

export interface OidcTokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}

// Thrown when the player cancels the browser-wait screen (see abort()). Distinguished from a genuine
// login failure so the caller can reset quietly instead of surfacing an error to the player.
export class LoginAbortedError extends Error {
  constructor() {
    super("login aborted");
    this.name = "LoginAbortedError";
  }
}

function oidcBase(): string {
  const host = (import.meta.env.VITE_KEYCLOAK_HOST as string).replace(
    /\/+$/,
    "",
  );
  return `${host}/realms/${REALM}/protocol/openid-connect`;
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomString(byteLength: number): string {
  return base64url(crypto.getRandomValues(new Uint8Array(byteLength)));
}

async function sha256(input: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return new Uint8Array(digest);
}

// Reads the persisted refresh token, migrating a pre-unification Linux token to the current key so
// players signed in before the rename stay signed in.
function storedRefreshToken(): string | null {
  const token = localStorage.getItem(REFRESH_KEY);
  if (token) return token;
  const legacy = localStorage.getItem(LEGACY_REFRESH_KEY);
  if (legacy) {
    localStorage.setItem(REFRESH_KEY, legacy);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }
  return legacy;
}

/**
 * Keycloak could not be reached, or answered that it is having a bad day - as opposed to answering
 * that the session is over. The distinction decides whether the stored refresh token survives, so
 * it is a type rather than a flag: losing a 30-day session to a Wi-Fi blip would be worse than the
 * expiry this flow exists to prevent.
 */
export class RefreshUnavailableError extends Error {
  constructor(cause: string) {
    super(`refresh unavailable: ${cause}`);
    this.name = "RefreshUnavailableError";
  }
}

// `plugin-http` issues the request from Rust, so it is not subject to the webview's CORS on its
// custom-scheme origin, the reason the exchange lives here rather than in a browser OIDC library.
//
// Throws RefreshUnavailableError when the answer says nothing about the session (no route, DNS,
// TLS, a proxy 502, Keycloak restarting) and a plain Error when Keycloak actively rejected the
// request. The connect is bounded: without it, an unreachable host leaves the caller - and the
// startup restore behind it - awaiting forever, which shows as an auth screen that never resolves.
async function tokenRequest(body: Record<string, string>): Promise<OidcTokens> {
  let response;
  try {
    response = await fetch(`${oidcBase()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
      connectTimeout: 8000,
    });
  } catch (e) {
    throw new RefreshUnavailableError(`${e}`);
  }
  if (!response.ok) {
    const detail = `${response.status}: ${await response.text()}`;
    // 5xx (and anything above) is the server failing, not a verdict on the session.
    if (response.status >= 500) {
      throw new RefreshUnavailableError(detail);
    }
    throw new Error(`Keycloak token endpoint returned ${detail}`);
  }
  return (await response.json()) as OidcTokens;
}

// Read claims from a JWT without verifying the signature. Only used for display (`preferred_username`)
// and the local expiry check; the token was just minted by Keycloak over the exchange we control.
function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1] ?? "";
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    // Decode as UTF-8: atob() yields one byte per character, so a multi-byte username (accents,
    // non-Latin scripts) would be mangled if the raw byte string were parsed directly.
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    );
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function usernameFromIdToken(idToken: string): string {
  const claims = decodeJwtClaims(idToken);
  return (claims.preferred_username as string) ?? (claims.name as string) ?? "";
}

// Access-token expiry in epoch milliseconds (0 when unknown), for the on-demand refresh check.
export function accessTokenExpiry(accessToken: string): number {
  const exp = decodeJwtClaims(accessToken).exp;
  return typeof exp === "number" ? exp * 1000 : 0;
}

// Escapes for both element text and double/single-quoted attribute contexts (successPage puts the
// locale in an attribute), so quotes must be escaped too, not only the angle brackets.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function successPage(): string {
  // The copy comes from the app's own messages, so this page speaks every language the app does and
  // stays in the Crowdin pipeline - it used to carry a private table covering five of thirteen, and
  // a player in any of the other eight was sent to a page in a language they had not chosen.
  const { t, locale: activeLocale, availableLocales } = tsi18n.global;
  // Validate the active locale against the loaded set before interpolating it into the page (it
  // lands in the <html lang> attribute), so only a known language tag is ever emitted. "source" is
  // the translator-facing copy of English, never a language a player runs in.
  const rawLocale = String(activeLocale.value);
  // find() rather than a cast: it hands back the locale union vue-i18n types its messages with, so
  // an unknown or removed language falls back to English instead of reaching t().
  const locale =
    availableLocales.find((l) => l === rawLocale && l !== "source") ?? "en";
  const title = escapeHtml(t("login.succeed", locale));
  const message = escapeHtml(t("login.browser.done", locale));
  const style =
    "*{box-sizing:border-box}html,body{margin:0;height:100%}" +
    'body{display:flex;align-items:center;justify-content:center;background:#171a21;color:#e6e6e6;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}' +
    ".card{max-width:420px;margin:24px;padding:40px 32px;text-align:center;background:#1e222b;border:1px solid rgba(50,212,153,.25);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.45)}" +
    ".badge{width:64px;height:64px;margin:0 auto 22px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(50,212,153,.12);border:1px solid rgba(50,212,153,.45)}" +
    ".badge svg{width:34px;height:34px}h1{margin:0 0 10px;font-size:22px;font-weight:600;color:#32d499}" +
    "p{margin:0;font-size:15px;line-height:1.5;color:#a9b1bd}.brand{margin-top:26px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5b6472}";
  return (
    `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>BetterFleet</title>` +
    `<style>${style}</style></head><body><div class="card"><div class="badge">` +
    `<svg viewBox="0 0 24 24" fill="none" stroke="#32d499" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>` +
    `</div><h1>${title}</h1><p>${message}</p><div class="brand">BetterFleet</div></div></body></html>`
  );
}

// Rejecter for the in-flight interactive login's capture promise, held at module scope so abort() can
// unblock a login the player walked away from. Null when no login is waiting on the browser.
let pendingReject: ((reason: unknown) => void) | null = null;

// Full interactive login: hosted Keycloak page in the system browser, code captured on the loopback.
export async function login(): Promise<OidcTokens> {
  const verifier = randomString(32);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);

  const port = await start({
    ports: [REDIRECT_PORT],
    response: successPage(),
  });

  let unlisten: (() => void) | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    let resolveUrl!: (url: string) => void;
    const captured = new Promise<string>((resolve, reject) => {
      resolveUrl = resolve;
      pendingReject = reject;
    });
    // Surface a stuck flow (browser closed, or the player never finished) as an error rather than
    // waiting indefinitely on a callback that will never arrive.
    timeout = setTimeout(
      () => pendingReject?.(new Error("login timed out")),
      120_000,
    );
    // Register the redirect listener and await it before opening the browser: awaiting here means a
    // listener that fails to register rejects the flow instead of leaking an unhandled rejection.
    unlisten = await onUrl((url) => {
      clearTimeout(timeout);
      resolveUrl(url);
    });

    const authorizeUrl = `${oidcBase()}/auth?${new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      // offline_access yields a long-lived refresh token, so restore() keeps the player signed in
      // across restarts without reopening the browser (the desktop "stay connected").
      scope: "openid offline_access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      // Force the credentials prompt on an explicit login: after a logout (local token forgotten)
      // the next sign-in then asks for credentials instead of silently reusing Keycloak's SSO
      // session. Silent reconnection still happens via restore()/the refresh token, not this URL.
      prompt: "login",
    }).toString()}`;

    await open(authorizeUrl);

    const params = new URL(await captured).searchParams;
    if (params.get("state") !== state) throw new Error("OAuth state mismatch");
    const errorParam = params.get("error");
    if (errorParam) throw new Error(`authorization failed: ${errorParam}`);
    const code = params.get("code");
    if (!code) throw new Error("no authorization code in callback");

    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: verifier,
    });
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    return tokens;
  } finally {
    clearTimeout(timeout);
    pendingReject = null;
    unlisten?.();
    await cancel(port).catch(() => undefined);
  }
}

// Abort an in-flight interactive login: reject its capture promise and release the loopback listener.
// The browser-wait "Cancel" relies on this to free the fixed redirect port. Without it a half-finished
// attempt leaves the listener bound and the next login() fails to bind the port (EADDRINUSE). Cancels
// here directly (not only via login()'s finally) so it still frees the port even if the caller tears
// the page down before that finally runs.
export async function abort(): Promise<void> {
  pendingReject?.(new LoginAbortedError());
  await cancel(REDIRECT_PORT).catch(() => undefined);
}

// Silent restore on startup / refresh: trade the persisted refresh token for fresh ones. Returns null
// (and clears the stored token) when there is no session or Keycloak rejected it; throws
// RefreshUnavailableError - keeping the token - when Keycloak could not be reached at all.
export async function restore(): Promise<OidcTokens | null> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) return null;
  try {
    const tokens = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    return tokens;
  } catch (e) {
    if (e instanceof RefreshUnavailableError) {
      // Keep the token: the session may well still be valid, and the caller can try again on the
      // next tick. Deleting it here would turn a network blip into a full browser re-login.
      throw e;
    }
    // Keycloak rejected the token (expired, revoked, realm reset): the session is over.
    localStorage.removeItem(REFRESH_KEY);
    return null;
  }
}

// Best-effort server-side logout: ask Keycloak to revoke the session tied to the stored refresh token
// so signing out actually ends it, instead of only forgetting the local copy (a still-live SSO session
// would otherwise let the next login silently reconnect). Swallows every error and bounds the connect
// so an offline or unreachable logout still lets the local sign-out proceed.
export async function endSession(): Promise<void> {
  const refreshToken = storedRefreshToken();
  if (!refreshToken) return;
  try {
    await fetch(`${oidcBase()}/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }).toString(),
      connectTimeout: 3000,
    });
  } catch {
    // Offline or unreachable: the local logout still clears the stored token.
  }
}

export function forget(): void {
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
}
