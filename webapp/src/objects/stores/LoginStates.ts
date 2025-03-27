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
      });

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
