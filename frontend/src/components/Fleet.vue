<template>
  <div v-if="UserStore.player.fleet" class="lobby-wrapper">
    <FleetLobby
      v-if="UserStore.player.fleet.sessionId"
      :session="UserStore.player.fleet as Fleet"
    />
    <FleetSessionChoice v-else :session="UserStore.player.fleet as Fleet" />
  </div>
</template>

<script setup lang="ts">
import FleetSessionChoice from "@/components/fleet/FleetSessionChoice.vue";
import FleetLobby from "@/components/fleet/FleetLobby.vue";
import { Fleet } from "@/objects/Fleet.ts";
import { onUnmounted } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";

UserStore.player.fleet = new Fleet();

onUnmounted(() => {
  if (UserStore.player.fleet) {
    UserStore.player.fleet.leaveSession();
  }
});
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
