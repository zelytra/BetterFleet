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
import {Fleet, PlayerStates} from "@/objects/Fleet.ts";
import {onUnmounted} from "vue";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {invoke} from '@tauri-apps/api/tauri'
import {Utils} from "@/objects/Utils.ts";

UserStore.player.fleet = new Fleet();

const gameStatusRefresh: number = setInterval(() => {
  invoke('get_game_status').then((response: any) => {

    const retrieveStatus: PlayerStates = Utils.parseRustPlayerStatus(response)

    if (UserStore.player.status != retrieveStatus) {

      UserStore.player.status = Utils.parseRustPlayerStatus(response)
      const fleet: Fleet = UserStore.player.fleet as Fleet;

      // Reset player server
      if (UserStore.player.status == PlayerStates.IN_GAME && Utils.parseRustPlayerStatus(response) != PlayerStates.IN_GAME) {
        console.log("leave server")
        fleet.leaveServer();
      }

      if (fleet && fleet.socket && fleet.socket.OPEN) {
        fleet.updateToSession();
      }


    }
  })
}, 400);

const serverIpRefresh: number = setInterval(() => {
  invoke('get_server_address').then((response: any) => {
    if (UserStore.player.server) {
      return;
    }
    console.log("join repeat")
    UserStore.player.server = {
      connectedPlayers: [],
      hash: undefined,
      ip: response.split(":")[0],
      location: "",
      port: Number.parseInt(response.split(":")[1]),
    }

    const fleet: Fleet = UserStore.player.fleet as Fleet;
    fleet.joinServer();

  })
}, 400);

onUnmounted(() => {
  if (UserStore.player.fleet) {
    UserStore.player.fleet.leaveSession();
  }
});

onUnmounted(() => {
  clearInterval(gameStatusRefresh)
  clearInterval(serverIpRefresh)
})
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
