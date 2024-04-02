<template>
  <section class="app-section">
    <Header/>
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component"/>
        </transition>
      </router-view>
    </section>
  </section>
</template>

<script setup lang="ts">
import Header from "@/components/global/Header.vue";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {LocalKey} from "@/objects/stores/LocalStore.ts";
import {onMounted, onUnmounted, watch} from "vue";
import {PlayerDevice, PlayerStates} from "@/objects/fleet/Player.ts";
import {Fleet} from "@/objects/fleet/Fleet.ts";
import {invoke} from "@tauri-apps/api/tauri";
import {RustSotServer} from "@/objects/fleet/SotServer.ts";
import {Utils} from "@/objects/utils/Utils.ts";
import router from "@/router";
import {HTTPAxios} from "@/objects/utils/HTTPAxios.ts";

const tokenRefresher = setInterval(() => {
  HTTPAxios.updateToken();
}, 1000)
const gameStatusRefresh: number = setInterval(() => {
  invoke('get_game_object').then((response: any) => {
    const rustSotServer: RustSotServer = {status: PlayerStates.CLOSED, ip: response.ip, port: response.port}
    rustSotServer.status = Utils.parseRustPlayerStatus(response.status);

    if (UserStore.player.status != rustSotServer.status) {

      const fleet: Fleet = UserStore.player.fleet as Fleet;

      // Reset player server
      if (UserStore.player.status == PlayerStates.IN_GAME && rustSotServer.status != PlayerStates.IN_GAME) {
        fleet.leaveServer();
      } else if (rustSotServer.ip && UserStore.player.status != PlayerStates.IN_GAME && rustSotServer.status == PlayerStates.IN_GAME) {
        UserStore.player.server = {
          connectedPlayers: [],
          hash: undefined,
          ip: rustSotServer.ip,
          location: "",
          port: rustSotServer.port,
          color: ""
        }
        fleet.joinServer();
      }

      UserStore.player.status = rustSotServer.status;
      fleet.updateToSession();
    }
  })
}, 400);

//document.addEventListener('contextmenu', event => event.preventDefault());
onMounted(() => {
  UserStore.init({
    lang: "en",
    soundEnable: true,
    soundLevel: 30,
    isMaster: false,
    isReady: false,
    status: PlayerStates.CLOSED,
    username: "",
    device: PlayerDevice.MICROSOFT
  });

});

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
  clearInterval(gameStatusRefresh)
  clearInterval(tokenRefresher)
});

watch(() => UserStore.player.countDown, () => {
  router.push("/fleet")
})
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