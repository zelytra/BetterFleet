import { reactive } from "vue";
import Keycloak, { KeycloakConfig } from "keycloak-js";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { isLinux } from "@/objects/utils/platform.ts";
import * as LinuxAuth from "@/objects/stores/LinuxAuth.ts";
import { error as logError } from "@tauri-apps/plugin-log";
import { alertProvider } from "@/main.ts";
import { AlertType } from "@/vue/alert/Alert.ts";
import { tsi18n } from "@/objects/i18n";

const { t } = tsi18n.global;

export interface KeycloakUser {
  username: string;
}

const initOptions: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_HOST,
  realm: "Betterfleet",
  clientId: "application",
};

// Dedupes concurrent Linux token refreshes so parallel requests share one refresh instead of each
// firing a redundant token call and racing to overwrite the stored token. This realm does not rotate
// refresh tokens (revokeRefreshToken=false), so the concern is the duplicate work and last-writer
// churn, not the tokens invalidating one another. Module-level (not in the reactive store) so the
// in-flight promise is never wrapped by Vue reactivity.
let linuxRefreshInFlight: Promise<boolean> | null = null;

export const keycloakStore = reactive({
  keycloak: new Keycloak(initOptions),
  isAuthenticated: false,
  // Linux only (#740): true while the system browser is open for the loopback login, so the auth
  // screen can tell the player to finish in their browser instead of showing a dead login button.
  awaitingBrowser: false,
  /**
   * Whether the SSO check has settled, either way.
   *
   * `isAuthenticated` starts false and only becomes true once keycloak has answered, so on its own
   * it cannot tell "signed out" from "we have not asked yet", which is why the login screen used to
   * flash at players who were already signed in. The auth screen waits on this instead.
   */
  isReady: false,
  user: {} as KeycloakUser,

  init(redirectionUrl: string) {
    if (isLinux()) {
      void this.initLinux();
      return;
    }
    this.keycloak
      .init({
        onLoad: "check-sso",
        checkLoginIframe: false,
        redirectUri: redirectionUrl,
      })
      .then((auth: boolean) => {
        this.isAuthenticated = auth;
        if (auth) {
          this.keycloak.loadUserInfo().then((userInfo: any) => {
            this.user.username = userInfo.preferred_username;
            UserStore.player.username = this.user.username;
          });
        }
      })
      // A self-hosted or unreachable keycloak rejects here. The answer is still "not signed in",
      // and the screen has to move on regardless, or an offline player waits on a ship forever.
      .catch(() => (this.isAuthenticated = false))
      .finally(() => (this.isReady = true));

    this.keycloak.onTokenExpired = () => {
      HTTPAxios.updateToken();
    };
  },
  loginUser(redirectionUrl: string) {
    if (isLinux()) {
      void this.loginLinux();
      return;
    }
    if (
      !keycloakStore.isAuthenticated ||
      !keycloakStore.keycloak.authenticated
    ) {
      keycloakStore.keycloak
        .createLoginUrl({ redirectUri: redirectionUrl })
        .then((url) => {
          window.open(url, "_self");
        });
    }
  },

  // --- Linux loopback OIDC (#740) ------------------------------------------------------------
  // The tauri://localhost webview origin cannot be an OAuth redirect target, so on Linux keycloak-js
  // is only a token holder: LinuxAuth drives the hosted login over a loopback, and the token exchange
  // and refresh go through plugin-http because keycloak-js's own updateToken/loadUserInfo/login would
  // hit the origin Keycloak rejects. See LinuxAuth.ts.
  async initLinux() {
    this.keycloak.updateToken = ((minValidity?: number) =>
      this.ensureFreshLinux(
        typeof minValidity === "number" ? minValidity : 5,
      )) as typeof this.keycloak.updateToken;
    this.keycloak.logout = (async () => {
      // Revoke the Keycloak session server-side before dropping the local tokens, so signing out here
      // actually ends the SSO session instead of leaving it live for a silent re-login. Best-effort:
      // endSession swallows its own errors, so an offline logout still clears locally.
      await LinuxAuth.endSession();
      LinuxAuth.forget();
      this.resetLinux();
      // Full reload drops any live session socket with the old page and re-runs the (now empty)
      // silent restore, landing on the sign-in screen.
      window.location.reload();
    }) as typeof this.keycloak.logout;

    try {
      const tokens = await LinuxAuth.restore();
      if (tokens) this.applyTokensLinux(tokens);
    } catch (e) {
      logError(`Linux OIDC restore failed: ${e}`);
    } finally {
      this.isReady = true;
    }
  },
  async loginLinux() {
    if (this.isAuthenticated && this.keycloak.authenticated) return;
    // Already signed in from another launch? Restore silently (persisted refresh token) rather than
    // reopening the browser for a player who is effectively still connected.
    const restored = await LinuxAuth.restore();
    if (restored) {
      this.applyTokensLinux(restored);
      return;
    }
    this.awaitingBrowser = true;
    try {
      const tokens = await LinuxAuth.login();
      this.applyTokensLinux(tokens);
    } catch (e) {
      // A deliberate cancel from the browser-wait screen is not a failure: reset quietly, no alert.
      if (!(e instanceof LinuxAuth.LoginAbortedError)) {
        logError(`Linux OIDC login failed: ${e}`);
        // Port busy, the timeout, a state mismatch, denied consent, a dropped network: previously the
        // failure was silent and the screen just fell back to the login button with no explanation.
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
  applyTokensLinux(tokens: LinuxAuth.OidcTokens) {
    this.keycloak.token = tokens.access_token;
    this.keycloak.refreshToken = tokens.refresh_token;
    this.keycloak.idToken = tokens.id_token;
    this.keycloak.authenticated = true;
    this.isAuthenticated = true;
    this.user.username = LinuxAuth.usernameFromIdToken(tokens.id_token);
    UserStore.player.username = this.user.username;
    // Deliberately no HTTPAxios.updateToken() call here: it routes through our updateToken override,
    // which can refresh and re-enter applyTokensLinux, looping when the access-token lifespan is
    // <= 60s (Keycloak's default). The bearer header is set on demand before each request
    // (HTTPAxios.updateToken, e.g. Fleet.joinSession), exactly as on Windows.
  },
  resetLinux() {
    this.keycloak.token = undefined;
    this.keycloak.refreshToken = undefined;
    this.keycloak.idToken = undefined;
    this.keycloak.authenticated = false;
    this.isAuthenticated = false;
    this.user.username = "";
  },
  async ensureFreshLinux(minValiditySeconds: number): Promise<boolean> {
    const remaining =
      LinuxAuth.accessTokenExpiry(this.keycloak.token ?? "") - Date.now();
    if (remaining > minValiditySeconds * 1000) return false;
    // Share one in-flight refresh so parallel requests do not each rotate (and invalidate) the
    // refresh token.
    if (!linuxRefreshInFlight) {
      linuxRefreshInFlight = (async () => {
        try {
          const tokens = await LinuxAuth.restore();
          if (!tokens) {
            this.resetLinux();
            throw new Error("Linux OIDC session expired");
          }
          this.applyTokensLinux(tokens);
          return true;
        } finally {
          linuxRefreshInFlight = null;
        }
      })();
    }
    return linuxRefreshInFlight;
  },
});
