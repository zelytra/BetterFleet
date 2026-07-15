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
</template>

<script setup lang="ts">
import HeaderComponent from "@/components/global/HeaderComponent.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import { onUnmounted, watch } from "vue";
import { PlayerStates } from "@/objects/fleet/Player.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { invoke } from "@tauri-apps/api/tauri";
import { RustSotServer } from "@/objects/fleet/SotServer.ts";
import { Utils } from "@/objects/utils/Utils.ts";
import router from "@/router";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";

const tokenRefresher = setInterval(() => {
  HTTPAxios.updateToken();
}, 1000);
const gameStatusRefresh: number = setInterval(() => {
  invoke("get_game_object").then((response: any) => {
    const rustSotServer: RustSotServer = {
      status: PlayerStates.CLOSED,
      ip: response.ip,
      port: response.port,
    };
    rustSotServer.status = Utils.parseRustPlayerStatus(response.status);

    const fleet: Fleet = UserStore.player.fleet as Fleet;
    const isPlayerNewlyInGame: boolean =
      UserStore.player.status != PlayerStates.IN_GAME &&
      rustSotServer.status == PlayerStates.IN_GAME;
    const isPlayerDisconnecting: boolean =
      UserStore.player.status == PlayerStates.IN_GAME &&
      rustSotServer.status != PlayerStates.IN_GAME;
    // Fire on the first detection AND whenever the detected server IP changes, so
    // a wrong first detection self-corrects instead of sticking until reconnect
    // (see issue #364). The backend detector is now self-correcting too.
    const isServerDetectedOrChanged: boolean =
      UserStore.player.status == PlayerStates.IN_GAME &&
      rustSotServer.ip != undefined &&
      rustSotServer.ip != "" &&
      UserStore.player.server?.ip != rustSotServer.ip;

    // Reset player server
    if (isPlayerDisconnecting) {
      fleet.leaveServer();
      fleet.updateToSession();
    } else if (
      (isPlayerNewlyInGame && rustSotServer.ip) ||
      isServerDetectedOrChanged
    ) {
      // Switching servers (the detected IP changed mid-game): leave the previous
      // one first, otherwise the player ends up in two servers at once — shown
      // twice, and left lingering in the old server once they reach the menu.
      if (
        UserStore.player.server != undefined &&
        UserStore.player.server.ip != rustSotServer.ip
      ) {
        fleet.leaveServer();
      }
      UserStore.player.server = {
        connectedPlayers: [],
        hash: undefined,
        ip: rustSotServer.ip,
        location: "",
        port: rustSotServer.port,
        color: "",
      };
      fleet.joinServer();
      fleet.updateToSession();
    }

    if (UserStore.player.status != rustSotServer.status) {
      UserStore.player.status = rustSotServer.status;
      fleet.updateToSession();
    }
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
