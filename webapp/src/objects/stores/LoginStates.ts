import { reactive } from "vue";
import Keycloak, { KeycloakConfig } from "keycloak-js";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";

export interface KeycloakUser {
  username: string;
}

const initOptions: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_HOST,
  realm: "Betterfleet",
  clientId: "application",
};

export const keycloakStore = reactive({
  keycloak: new Keycloak(initOptions),
  isAuthenticated: false,
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
});
