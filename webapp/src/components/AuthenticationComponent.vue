<template>
  <section class="auth-page" :aria-busy="!keycloakStore.isReady">
    <img src="@/assets/icons/full-logo.svg" alt="app logo" />
    <!-- The SSO check is the app's one real wait. Until it answers we cannot know which card to
         show, and guessing "signed out" flashed the login screen at players who were not. The three
         states cross-fade: out then in, so the card is never swapped under the eye in one frame. -->
    <transition name="swap" mode="out-in">
      <BoatLoader
        v-if="showLoader"
        key="loading"
        class="card"
        :label="t('loading.signingIn')"
        :size="180"
      />
      <div
        v-else-if="keycloakStore.isReady && !keycloakStore.isAuthenticated"
        key="login"
        class="card login-wrapper"
      >
        <h1>
          {{ t("login.welcome") }} <strong>{{ t("appName") }}</strong>
        </h1>
        <p>{{ t("login.description") }}</p>
        <PirateButton
          :label="t('login.loginButton')"
          @on-button-click="authUser"
        />
      </div>
      <div v-else-if="keycloakStore.isReady" key="user" class="card user-card">
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
    </transition>
  </section>
</template>

<script setup lang="ts">
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import BoatLoader from "@/vue/templates/BoatLoader.vue";
import router from "@/router";
import { UserStore } from "@/objects/stores/UserStore";
import { Utils } from "@/objects/utils/Utils";
import { useDelayedLoading } from "@/objects/utils/DelayedLoading.ts";
import { computed, onMounted, onUnmounted } from "vue";

const { t } = useI18n();

// A warm SSO check answers in well under the delay, so the usual launch shows no ship at all — the
// login card is simply there. The ship is for the cold start and the slow network.
const showLoader = useDelayedLoading(computed(() => !keycloakStore.isReady));

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
// Out then in rather than a true cross-fade: the three cards are different sizes, and overlapping
// them mid-swap reads as two things on screen at once.
.swap-enter-active,
.swap-leave-active {
  transition: opacity 150ms ease;
}

.swap-enter-from,
.swap-leave-to {
  opacity: 0;
}

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
