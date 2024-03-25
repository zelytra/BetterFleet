import {reactive} from 'vue'
import Keycloak, {KeycloakConfig} from "keycloak-js";

let initOptions: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_HOST,
  realm: 'Betterfleet',
  clientId: 'application'
}

export const keycloakStore = reactive({
  keycloak: new Keycloak(initOptions),
  isKeycloakInit: false,

  init(redirectionUrl: string) {
    this.keycloak.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      silentCheckSsoRedirectUri: false,
      redirectUri: redirectionUrl
      //silentCheckSsoRedirectUri: window.location.origin + '/silent-check-sso.html',
    }).then((auth: boolean) => {
      this.isKeycloakInit = auth;
    })
  },
  loginUser(redirectionUrl: string) {
    if (!keycloakStore.isKeycloakInit || !keycloakStore.keycloak.authenticated) {
      window.open(keycloakStore.keycloak.createLoginUrl({redirectUri: redirectionUrl}), '_self')
    }
  }
})
