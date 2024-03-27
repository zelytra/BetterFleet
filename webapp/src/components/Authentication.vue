<template>
  <section class="auth-page" @click="()=>{console.log(keycloakStore.isAuthenticated)}">
    <img src="@/assets/icons/full-logo.svg" alt="app logo"/>
    <div class="card login-wrapper" v-if="!keycloakStore.isAuthenticated">
      <h1>{{ t('login.welcome') }} <strong>{{ t('appName') }}</strong></h1>
      <p>{{ t('login.description') }}</p>
      <PirateButton :label="t('login.loginButton')" @on-button-click="authUser"/>
    </div>
    <div class="card user-card" v-else>
      <h1>{{ t('login.succeed') }}</h1>
      <p>{{ t('login.userWelcome') }} <strong>{{ keycloakStore.user.username }}</strong> !</p>
      <div class="action-wrapper">
        <PirateButton :label="t('login.continue')" @on-button-click="leavePage()"/>
        <p class="sub-action" @click="keycloakStore.keycloak.logout()">{{ t('login.disconnect') }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

import {keycloakStore} from "@/objects/stores/LoginStates.ts";
import {useI18n} from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import router from "@/router";

const {t} = useI18n();

function authUser() {
  if (!keycloakStore.isAuthenticated || !keycloakStore.keycloak.authenticated) {
    keycloakStore.loginUser(window.location.origin)
  }
}

function leavePage(){
  router.push("/")
}
</script>

<style scoped lang="scss">
section.auth-page {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--primary-background);
  display: flex;
  justify-self: center;
  align-items: center;

  img {
    position: absolute;
    top: 25px;
    left: 50%;
    transform: translate(-50%, 0);
    width: 350px;
  }

  .card {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    &.login-wrapper {
      width: 928px;
      height: 431px;
      background: url("@assets/backgrounds/login.svg") no-repeat;
      background-size: 100% 100%;
      gap: 60px;

      h1 {
        font-family: BrushTip, sans-serif;
        font-size: 45px;

        strong {
          font-family: BrushTip, sans-serif;
          color: var(--primary);
        }
      }

      p {
        text-align: center;
        max-width: 80%;
      }
    }

    &.user-card {
      top: 55%;
      left: 50%;
      width: 350px;
      height: 450px;
      background: url("@assets/backgrounds/user-card.svg") no-repeat;
      background-size: 100% 100%;
      gap: 60px;

      h1 {
        font-family: BrushTip, sans-serif;
        font-size: 28px;
      }

      p {
        text-align: center;
        max-width: 80%;

        strong {
          color: var(--primary);
        }
      }

      .action-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;

        p {
          color: var(--secondary-text);
          font-size: 14px;
          margin-top: -10px;
          cursor: pointer;
        }
      }


    }
  }
}
</style>