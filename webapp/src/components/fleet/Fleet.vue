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
import FleetSessionChoice from "@/components/fleet/session/FleetSessionChoice.vue";
import FleetLobby from "@/components/fleet/session/FleetLobby.vue";
import {Fleet} from "@/objects/fleet/Fleet.ts";
import {UserStore} from "@/objects/stores/UserStore.ts";
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
