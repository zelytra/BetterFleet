import { start, onUrl, cancel } from "@fabianlars/tauri-plugin-oauth";
import { open } from "@tauri-apps/plugin-shell";
import { fetch } from "@tauri-apps/plugin-http";

// Loopback OIDC for the Linux desktop build (#740). The webview's `tauri://localhost` origin cannot
// be an OAuth redirect target: webviews block redirects to non-HTTP(S) schemes, so Keycloak refuses
// `tauri://localhost` with "Redirection to URL with a scheme that is not HTTP(S)" (Windows/macOS is
// unaffected — WebView2 serves `https://tauri.localhost`, which Keycloak accepts). The native-app
// standard (RFC 8252) is a loopback: open the hosted Keycloak login in the system browser with an
// `http://localhost:<port>` redirect, capture the code with a tiny local server
// (`tauri-plugin-oauth`), and run the PKCE token exchange from Rust through `plugin-http` so the
// webview never makes the cross-origin call (no CORS against the custom scheme).

// Fixed loopback port, so the redirect URI to register in Keycloak is a single exact string:
//   Valid redirect URIs -> http://localhost:47823/callback
const REDIRECT_PORT = 47823;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/callback`;
const REALM = "Betterfleet";
const CLIENT_ID = "application";
// The refresh token is persisted so login survives a restart (the desktop equivalent of the SSO
// cookie the in-webview flow relies on elsewhere).
const REFRESH_KEY = "kc-linux-refresh-token";

export interface OidcTokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
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

// `plugin-http` issues the request from Rust, so it is not subject to the webview's CORS on the
// `tauri://localhost` origin — the reason the exchange lives here rather than in keycloak-js.
async function tokenRequest(body: Record<string, string>): Promise<OidcTokens> {
  const response = await fetch(`${oidcBase()}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  if (!response.ok) {
    throw new Error(
      `Keycloak token endpoint returned ${response.status}: ${await response.text()}`,
    );
  }
  return (await response.json()) as OidcTokens;
}

// Read claims from a JWT without verifying the signature. Only used for display (`preferred_username`)
// and the local expiry check; the token was just minted by Keycloak over the exchange we control.
function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
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

// Full interactive login: hosted Keycloak page in the system browser, code captured on the loopback.
export async function login(): Promise<OidcTokens> {
  const verifier = randomString(32);
  const challenge = base64url(await sha256(verifier));
  const state = randomString(16);

  const port = await start({
    ports: [REDIRECT_PORT],
    response:
      "BetterFleet : connexion réussie. Vous pouvez fermer cet onglet et revenir à l'application.",
  });

  let unlisten: (() => void) | undefined;
  try {
    const captured = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("login timed out")),
        300_000,
      );
      onUrl((url) => {
        clearTimeout(timeout);
        resolve(url);
      }).then((fn) => {
        unlisten = fn;
      });
    });

    const authorizeUrl = `${oidcBase()}/auth?${new URLSearchParams({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: "openid",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
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
    unlisten?.();
    await cancel(port).catch(() => undefined);
  }
}

// Silent restore on startup / refresh: trade the persisted refresh token for fresh ones. Returns null
// (and clears the stored token) when there is no session or it has expired.
export async function restore(): Promise<OidcTokens | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;
  try {
    const tokens = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    });
    localStorage.setItem(REFRESH_KEY, tokens.refresh_token);
    return tokens;
  } catch {
    localStorage.removeItem(REFRESH_KEY);
    return null;
  }
}

export function forget(): void {
  localStorage.removeItem(REFRESH_KEY);
}
