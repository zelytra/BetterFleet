<template>
  <div class="lobby-wrapper">
    <FleetLobby v-if="session.isConnected()" :session="session" />
    <FleetSessionChoice v-else :session="session" />
  </div>
</template>

<script setup lang="ts">
import FleetSessionChoice from "@/components/fleet/FleetSessionChoice.vue";
import FleetLobby from "@/components/fleet/FleetLobby.vue";
import { Fleet, PlayerStates } from "@/objects/Fleet.ts";
import { onMounted, ref } from "vue";

const session = ref<Fleet>(new Fleet("xxx"));
onMounted(() => {
  for (let x = 0; x < 100; x++) {
    session.value.players.push({
      username: "Oskour",
      status: PlayerStates.IN_GAME,
      isReady: x % 2 == 0,
      isMaster: x % 2 == 0,
    });
  }
});
</script>

<style scoped lang="scss">
.lobby-wrapper {
  height: 100%;
  box-sizing: border-box;
}
</style>
