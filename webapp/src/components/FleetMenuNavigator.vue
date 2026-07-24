<template>
  <section class="app-section">
    <HeaderComponent />
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </section>
  </section>
  <!-- What's new (#686): mounted in the authed shell, so it can only appear once the player is
       past the login screen — never over the auth page. -->
  <WhatsNewModal />
</template>

<script setup lang="ts">
import HeaderComponent from "@/components/global/HeaderComponent.vue";
import WhatsNewModal from "@/components/WhatsNewModal.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import { onUnmounted, watch } from "vue";
import { Player } from "@/objects/fleet/Player.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { invoke } from "@tauri-apps/api/tauri";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";
import { syncGameState } from "@/objects/fleet/GameSync.ts";
import { observeDetection } from "@/objects/fleet/DetectionWatchdog.ts";
import { observeConvergence } from "@/objects/fleet/SessionRecap.ts";
import { Utils } from "@/objects/utils/Utils.ts";
import router from "@/router";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";

const tokenRefresher = setInterval(() => {
  HTTPAxios.updateToken();
}, 1000);
const gameStatusRefresh: number = setInterval(() => {
  invoke("get_game_object").then((response: any) => {
    const rustSotServer: RustSotServer = {
      status: Utils.parseRustPlayerStatus(response.status),
      ip: response.ip,
      port: response.port,
    };
    syncGameState(
      rustSotServer,
      UserStore.player as Player,
      UserStore.player.fleet as Fleet,
    );
    // Guided diagnostic (#688): the same poll feeds the silent-detection watchdog.
    observeDetection(UserStore.player as Player);
    // Shareable recap (#685): and the convergence watchdog behind the "alliance formed" card.
    observeConvergence(UserStore.player as Player);
  });
}, 400);

//document.addEventListener('contextmenu', event => event.preventDefault());

window.onbeforeunload = () => {
  window.localStorage.setItem(
    LocalKey.USER_STORE,
    JSON.stringify(UserStore.player),
  );
};

onUnmounted(() => {
  if (UserStore.player.fleet) {
    UserStore.player.fleet.leaveSession();
  }
  clearInterval(gameStatusRefresh);
  clearInterval(tokenRefresher);
});

watch(
  () => UserStore.player.countDown,
  () => {
    router.push("/fleet/session");
  },
);
</script>

<style scoped lang="scss">
.app-section {
  display: flex;

  .content {
    height: 100vh;
    overflow: hidden;
    overflow-y: auto;
    padding: 12px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }
}
</style>
