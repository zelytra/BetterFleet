<template>
  <div v-if="UserStore.player.fleet" class="lobby-wrapper">
    <transition>
      <FleetLobby
        v-if="UserStore.player.fleet.sessionId"
        :session="UserStore.player.fleet as Fleet"
      />
      <PublicFleetSessions v-else :session="UserStore.player.fleet as Fleet" />
    </transition>
  </div>
</template>

<script setup lang="ts">
import FleetLobby from "@/components/fleet/session/lobby/FleetLobby.vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import PublicFleetSessions from "@/components/fleet/session/menu/PublicFleetSessions.vue";
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
