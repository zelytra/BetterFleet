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

      if (fleet && fleet.socket && fleet.socket.OPEN) {
        fleet.updateToSession();
      }

    }
  })
}, 300);

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
