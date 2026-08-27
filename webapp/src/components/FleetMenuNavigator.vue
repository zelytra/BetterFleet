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
       past the login screen, never over the auth page. -->
  <WhatsNewModal />
  <!-- Update prompt (#735 follow-up): same shell, opened from the header's update button. -->
  <UpdateModal />
</template>

<script setup lang="ts">
import HeaderComponent from "@/components/global/HeaderComponent.vue";
import WhatsNewModal from "@/components/WhatsNewModal.vue";
import UpdateModal from "@/components/UpdateModal.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import { onUnmounted, watch } from "vue";
import { Player } from "@/objects/fleet/Player.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { invoke } from "@tauri-apps/api/core";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";
import { syncGameState } from "@/objects/fleet/GameSync.ts";
import { observeDetection } from "@/objects/fleet/DetectionWatchdog.ts";
import { observeSocketless } from "@/objects/fleet/SocketlessWatchdog.ts";
import { observeCaptureHealth } from "@/objects/fleet/CaptureRepairWatchdog.ts";
import { observeConvergence } from "@/objects/fleet/SessionRecap.ts";
import { Utils } from "@/objects/utils/Utils.ts";
import router from "@/router";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";

const tokenRefresher = setInterval(() => {
  // updateToken never rejects (a failed refresh clears the bearer and alerts once, #803), so this
  // fire-and-forget can no longer leak an unhandled rejection every second.
  void HTTPAxios.updateToken();
}, 1000);
const gameStatusRefresh: number = setInterval(() => {
  invoke("get_game_object").then((response: any) => {
    const rustSotServer: RustSotServer = {
      status: Utils.parseRustPlayerStatus(response.status),
      ip: response.ip,
      port: response.port,
      noUdpCycles: response.noUdpCycles ?? 0,
    };
    syncGameState(
      rustSotServer,
      UserStore.player as Player,
      UserStore.player.fleet as Fleet,
    );
    // Guided diagnostic (#688): the same poll feeds the silent-detection watchdog.
    observeDetection(UserStore.player as Player);
    // Socketless watchdog (report id 801): raises the #688 diagnostic offer when the game runs
    // with no visible UDP sockets for minutes. Neutral by design: no cause is asserted.
    observeSocketless(rustSotServer, UserStore.player as Player);
    // Capture-repair watchdog (#819): the unelevated GUI cannot capture without the service, so
    // a missing or version-skewed service must become a banner with a next step, never silence.
    // performance.now() because the debounce must survive wall-clock steps (NTP, DST, manual).
    observeCaptureHealth(response.captureHealth ?? "ok", performance.now());
    // Shareable recap (#685): and the convergence watchdog behind the "alliance formed" card.
    observeConvergence(UserStore.player as Player);
  });
}, 400);

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
