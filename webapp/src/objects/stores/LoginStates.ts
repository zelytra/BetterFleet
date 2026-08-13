import { reactive } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import * as BrowserAuth from "@/objects/stores/BrowserAuth.ts";
import { error as logError } from "@tauri-apps/plugin-log";
import { alertProvider } from "@/main.ts";
import { AlertType } from "@/vue/alert/Alert.ts";
import { tsi18n } from "@/objects/i18n";

const { t } = tsi18n.global;

export interface KeycloakUser {
  username: string;
}

// The Keycloak session as the rest of the app sees it. Sign-in goes through the system browser on
// every platform (BrowserAuth.ts, RFC 8252 loopback + PKCE + offline_access): the webview never
// hosts a login page, so there is no keycloak-js here — this object keeps the shape its consumers
// (HTTPAxios, the router guard, the logout buttons) always read, backed by the loopback tokens.
export interface KeycloakSession {
  token?: string;
  refreshToken?: string;
  idToken?: string;
  authenticated: boolean;
  /** Resolves true when the token was refreshed, false when still fresh; rejects when the session
   * is gone. Same contract keycloak-js's updateToken had, so HTTPAxios is untouched. */
  updateToken(minValidity?: number): Promise<boolean>;
  logout(): Promise<void>;
}

// Dedupes concurrent token refreshes so parallel requests share one refresh instead of each firing
// a redundant token call and racing to overwrite the stored token. This realm does not rotate
// refresh tokens (revokeRefreshToken=false), so the concern is the duplicate work and last-writer
// churn, not the tokens invalidating one another. Module-level (not in the reactive store) so the
// in-flight promise is never wrapped by Vue reactivity.
let refreshInFlight: Promise<boolean> | null = null;
// The interactive login in flight, if any. Module-level for the same reason as the refresh above:
// the promise must never be wrapped by Vue reactivity.
let loginInFlight: Promise<void> | null = null;

export const keycloakStore = reactive({
  keycloak: {
    token: undefined,
    refreshToken: undefined,
    idToken: undefined,
    authenticated: false,
    updateToken: (minValidity?: number) =>
      keycloakStore.ensureFresh(
        typeof minValidity === "number" ? minValidity : 5,
      ),
    logout: async () => {
      // Revoke the Keycloak session server-side before dropping the local tokens, so signing out
      // here actually ends the SSO session instead of leaving it live for a silent re-login.
      // Best-effort: endSession swallows its own errors, so an offline logout still clears locally.
      await BrowserAuth.endSession();
      BrowserAuth.forget();
      keycloakStore.reset();
      // Full reload drops any live session socket with the old page and re-runs the (now empty)
      // silent restore, landing on the sign-in screen.
      window.location.reload();
    },
  } as KeycloakSession,
  isAuthenticated: false,
  // True while the system browser is open for the loopback login, so the auth screen can tell the
  // player to finish in their browser instead of showing a dead login button.
  awaitingBrowser: false,
  /**
   * Whether the silent session restore has settled, either way.
   *
   * `isAuthenticated` starts false and only becomes true once the restore has answered, so on its
   * own it cannot tell "signed out" from "we have not asked yet", which is why the login screen
   * used to flash at players who were already signed in. The auth screen waits on this instead.
   */
  isReady: false,
  user: {} as KeycloakUser,

  init() {
    void this.restoreSession();
  },
  // Silent restore on startup: trade the persisted refresh token (offline_access, 30-day sliding
  // idle) for fresh tokens, so a signed-in player never sees the browser again until logout.
  async restoreSession() {
    try {
      const tokens = await BrowserAuth.restore();
      if (tokens) this.applyTokens(tokens);
    } catch (e) {
      // Includes RefreshUnavailableError - starting offline, or before the VPN is up. The stored
      // token is deliberately kept in that case, so the session comes back on the next refresh
      // (or the moment the player presses "sign in", which restores before opening a browser).
      logError(`OIDC restore failed: ${e}`);
    } finally {
      // Either way the screen must move on, or an offline player waits on a ship forever.
      this.isReady = true;
    }
  },
  loginUser(): Promise<void> {
    if (this.isAuthenticated && this.keycloak.authenticated) {
      return Promise.resolve();
    }
    // One attempt at a time. Two fast clicks used to start two loopback servers: the second failed
    // to bind the fixed port, and its rejection flipped awaitingBrowser back off while the first
    // was still waiting on the browser, leaving the screen on a login button that does nothing.
    if (!loginInFlight) {
      loginInFlight = this.runLogin().finally(() => {
        loginInFlight = null;
      });
    }
    return loginInFlight;
  },
  async runLogin() {
    // Already signed in from another launch? Restore silently (persisted refresh token) rather than
    // reopening the browser for a player who is effectively still connected. An unreachable Keycloak
    // throws here and must NOT abort the click: falling through opens the browser, which is exactly
    // what the player asked for.
    try {
      const restored = await BrowserAuth.restore();
      if (restored) {
        this.applyTokens(restored);
        return;
      }
    } catch (e) {
      logError(`OIDC silent restore before login failed: ${e}`);
    }
    this.awaitingBrowser = true;
    try {
      const tokens = await BrowserAuth.login();
      this.applyTokens(tokens);
    } catch (e) {
      // A deliberate cancel from the browser-wait screen is not a failure: reset quietly, no alert.
      if (!(e instanceof BrowserAuth.LoginAbortedError)) {
        logError(`OIDC login failed: ${e}`);
        // Port busy, the timeout, a state mismatch, denied consent, a dropped network: previously
        // the failure was silent and the screen just fell back to the login button with no
        // explanation.
        alertProvider.sendAlert({
          title: t("alert.error.title"),
          content: t("login.browser.error"),
          type: AlertType.ERROR,
        });
      }
    } finally {
      this.awaitingBrowser = false;
    }
  },
  applyTokens(tokens: BrowserAuth.OidcTokens) {
    this.keycloak.token = tokens.access_token;
    this.keycloak.refreshToken = tokens.refresh_token;
    this.keycloak.idToken = tokens.id_token;
    this.keycloak.authenticated = true;
    this.isAuthenticated = true;
    this.user.username = BrowserAuth.usernameFromIdToken(tokens.id_token);
    UserStore.player.username = this.user.username;
    // Deliberately no HTTPAxios.updateToken() call here: it routes through updateToken above, which
    // can refresh and re-enter applyTokens, looping when the access-token lifespan is <= 60s
    // (Keycloak's default). The bearer header is set on demand before each request
    // (HTTPAxios.updateToken, e.g. Fleet.joinSession).
  },
  reset() {
    this.keycloak.token = undefined;
    this.keycloak.refreshToken = undefined;
    this.keycloak.idToken = undefined;
    this.keycloak.authenticated = false;
    this.isAuthenticated = false;
    this.user.username = "";
  },
  async ensureFresh(minValiditySeconds: number): Promise<boolean> {
    const remaining =
      BrowserAuth.accessTokenExpiry(this.keycloak.token ?? "") - Date.now();
    if (remaining > minValiditySeconds * 1000) return false;
    // Share one in-flight refresh so parallel requests do not each rotate (and invalidate) the
    // refresh token.
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          // Two failure shapes, deliberately different: restore() returns null when Keycloak
          // REJECTED the token - the session is over - and throws RefreshUnavailableError when it
          // could not be reached at all. Only the first signs the player out. A thrown error just
          // propagates: the caller drops its stale bearer rather than replaying it (#803), the
          // store stays signed in, and the next tick recovers - where a reset() here would end a
          // session over a Wi-Fi blip or a VPN re-handshake.
          const tokens = await BrowserAuth.restore();
          if (!tokens) {
            this.reset();
            throw new Error("OIDC session expired");
          }
          this.applyTokens(tokens);
          return true;
        } finally {
          refreshInFlight = null;
        }
      })();
    }
    return refreshInFlight;
  },
});
