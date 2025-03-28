<template>
  <section class="auth-page">
    <img src="@/assets/icons/full-logo.svg" alt="app logo" />
    <div v-if="!keycloakStore.isAuthenticated" class="card login-wrapper">
      <h1>
        {{ t("login.welcome") }} <strong>{{ t("appName") }}</strong>
      </h1>
      <p>{{ t("login.description") }}</p>
      <PirateButton
        :label="t('login.loginButton')"
        @on-button-click="authUser"
      />
    </div>
    <div v-else class="card user-card">
      <h1>{{ t("login.succeed") }}</h1>
      <div
        v-if="UserStore.player.username"
        class="user-icon"
        :style="{ backgroundColor: Utils.generateRandomColor() }"
      >
        <p>
          {{ UserStore.player.username.charAt(0).toUpperCase() }}
        </p>
      </div>
      <p>
        {{ t("login.userWelcome") }}
        <strong>{{ keycloakStore.user.username }}</strong> !
      </p>
      <div class="action-wrapper">
        <PirateButton
          :label="t('login.continue')"
          @on-button-click="leavePage()"
        />
        <p class="sub-action" @click="keycloakStore.keycloak.logout()">
          {{ t("login.disconnect") }}
        </p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import router from "@/router";
import { UserStore } from "@/objects/stores/UserStore";
import { Utils } from "@/objects/utils/Utils";
import { onMounted, onUnmounted } from "vue";

const { t } = useI18n();

onMounted(() => {
  document.addEventListener("keydown", keyPressEvent);
});

onUnmounted(() => {
  document.removeEventListener("keydown", keyPressEvent);
});

function keyPressEvent(event: KeyboardEvent) {
  if (event.key === "Enter") {
    leavePage();
  }
}

function authUser() {
  if (!keycloakStore.isAuthenticated || !keycloakStore.keycloak.authenticated) {
    keycloakStore.loginUser(window.location.origin);
  }
}

function leavePage() {
  router.push("/fleet/session");
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
      gap: 25px;

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

      .user-icon {
        width: 120px;
        height: 120px;
        border-radius: 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 6px;

        p {
          user-select: none;
          text-align: center;
          margin-top: 6px;
          font-size: 90px;
          color: white;
        }
      }
    }
  }
}
</style>
