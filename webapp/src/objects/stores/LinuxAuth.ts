import { start, onUrl, cancel } from "@fabianlars/tauri-plugin-oauth";
import { open } from "@tauri-apps/plugin-shell";
import { fetch } from "@tauri-apps/plugin-http";
import { i18n } from "@/main.ts";

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

// Success page shown in the browser tab after the callback, in the app's current language and the
// BetterFleet dark theme. Kept inline (not in the app locale files, which are for the in-app UI): it
// renders in the system browser and travels with this flow. tauri-plugin-oauth injects its capture
// <script> into <head>, so a full HTML document with <head> and <body> is required; it serves the
// page without a Content-Type, so the <meta charset> declares the encoding.
const SUCCESS_STRINGS: Record<string, { title: string; message: string }> = {
  en: {
    title: "Login successful",
    message: "You can close this tab and return to BetterFleet.",
  },
  fr: {
    title: "Connexion réussie",
    message: "Vous pouvez fermer cet onglet et revenir à BetterFleet.",
  },
  de: {
    title: "Anmeldung erfolgreich",
    message: "Sie können diesen Tab schließen und zu BetterFleet zurückkehren.",
  },
  es: {
    title: "Sesión iniciada",
    message: "Puedes cerrar esta pestaña y volver a BetterFleet.",
  },
  it: {
    title: "Accesso riuscito",
    message: "Puoi chiudere questa scheda e tornare a BetterFleet.",
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function successPage(): string {
  const locale = String(i18n.global.locale.value);
  const strings = SUCCESS_STRINGS[locale] ?? SUCCESS_STRINGS.en;
  const title = escapeHtml(strings.title);
  const message = escapeHtml(strings.message);
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
