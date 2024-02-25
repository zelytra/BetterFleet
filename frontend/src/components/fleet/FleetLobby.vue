<template>
  <section class="lobby-wrapper">
    <div class="header">
      <div class="content">
        <img src="@/assets/icons/sot.svg">
        <p>{{ session.sessionName }}</p>
      </div>
      <button>TODO</button>
    </div>
    <div class="lobby-content">
      <div class="player-table">
        <PlayerFleet v-for="player in session.players" :player="player"/>
      </div>
      <div class="lobby-details"/>
    </div>
  </section>
</template>

<script setup lang="ts">

import {PropType} from "vue";
import {Fleet} from "@/objects/Fleet.ts";
import PlayerFleet from "@/vue/fleet/PlayerFleet.vue";

defineProps({
  session: {
    type: Object as PropType<Fleet>,
    required: true
  }
})

</script>

<style scoped lang="scss">
.lobby-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;

  .header {
    border-radius: 5px;
    background: var(--secondary-background) url("@/assets/banners/lobby.png");
    background-size: cover;
    overflow: hidden;
    display: flex;
    justify-content: space-between;
    align-items: center;
    height: 100px;

    .content {
      display: flex;
      align-items: center;
      margin-left: 36px;
      gap: 32px;

      img {
        width: 64px;
        height: 64px;
      }

      p {
        font-family: BrushTip, sans-serif;
        font-size: 31px;
        align-self: end;
      }
    }
  }

  .lobby-content {
    height: calc(100% - 100px); // Minus header height

    .player-table {
      background: var(--secondary-background);
      height: 100%;
      padding: 8px;
      box-sizing: border-box;
      border-radius: 5px;
      overflow: hidden;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
  }

}
</style>