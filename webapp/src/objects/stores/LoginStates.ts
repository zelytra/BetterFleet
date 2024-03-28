import {reactive} from 'vue'
import Keycloak, {KeycloakConfig} from "keycloak-js";

export interface KeycloakUser {
  username: string
}

let initOptions: KeycloakConfig = {
  url: import.meta.env.VITE_KEYCLOAK_HOST,
  realm: 'Betterfleet',
  clientId: 'application'
}

export const keycloakStore = reactive({
  keycloak: new Keycloak(initOptions),
  isAuthenticated: false,
  user: {} as KeycloakUser,

  init(redirectionUrl: string) {
    this.keycloak.init({
      onLoad: 'check-sso',
      checkLoginIframe: false,
      redirectUri: redirectionUrl,
    }).then((auth: boolean) => {
      this.isAuthenticated = auth;
      if (auth) {
        this.keycloak.loadUserInfo().then((userInfo:any) => {
          console.log(userInfo)
          this.user.username = userInfo.name
        })
      }
    })
  },
  loginUser(redirectionUrl: string) {
    if (!keycloakStore.isAuthenticated || !keycloakStore.keycloak.authenticated) {
      window.open(keycloakStore.keycloak.createLoginUrl({redirectUri: redirectionUrl}), '_self')
    }
  }
})
