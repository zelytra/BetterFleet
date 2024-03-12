<template>
  <div v-if="UserStore.player.fleet" class="lobby-wrapper">
    <transition>
      <FleetLobby
          v-if="UserStore.player.fleet.sessionId"
          :session="UserStore.player.fleet as Fleet"
      />
      <FleetSessionChoice v-else :session="UserStore.player.fleet as Fleet"/>
    </transition>
  </div>
</template>

<script setup lang="ts">
import FleetSessionChoice from "@/components/fleet/FleetSessionChoice.vue";
import FleetLobby from "@/components/fleet/FleetLobby.vue";
import {Fleet} from "@/objects/Fleet.ts";
import {onUnmounted} from "vue";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {invoke} from '@tauri-apps/api/tauri'
import {Utils} from "@/objects/Utils.ts";
import {RustSotServer} from "@/objects/SotServer.ts";
import {PlayerStates} from "@/objects/Player.ts";

UserStore.player.fleet = new Fleet();

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
        }
        fleet.joinServer();
      }

      UserStore.player.status = rustSotServer.status;
      fleet.updateToSession();
    }
  })
}, 400);

onUnmounted(() => {
  if (UserStore.player.fleet) {
    UserStore.player.fleet.leaveSession();
  }
});

onUnmounted(() => {
  clearInterval(gameStatusRefresh)
})
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
