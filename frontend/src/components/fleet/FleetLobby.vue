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
        <PlayerFleet
            v-for="player in session.players.sort((a,b)=>{return (a.isMaster === b.isMaster)? 0 : a.isMaster? -1 : 1;})"
            :player="player"/>
      </div>
      <div class="lobby-details">
        <div class="header-information">
          <h2>{{ t('session.informations.title') }}</h2>
        </div>

        <div class="information-data">
          <h3>{{ t('session.informations.totalPlayer') }}</h3>
          <p>{{ session.players.length }}</p>
        </div>

        <div class="information-data important">
          <h3>{{ t('session.informations.totalPlayer') }}</h3>
          <p>{{ session.players.filter(x => x.isReady).length }} / <span>{{ session.players.length }}</span></p>
        </div>

        <div class="session-status">
          <p>{{ t('session.status.' + SessionStatus[session.status].toString().toLowerCase()) }}</p>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">

import {PropType} from "vue";
import {Fleet, SessionStatus} from "@/objects/Fleet.ts";
import PlayerFleet from "@/vue/fleet/PlayerFleet.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n()
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
    height: 140px;

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
    height: calc(100% - 140px); // Minus header height
    display: flex;
    gap: 12px;

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
      width: 100%;
    }

    .lobby-details {
      width: 10%;
      min-width: 150px;
      background: var(--secondary-background);
      border-radius: 5px;
      align-items: center;
      box-sizing: border-box;
      gap: 20px;
      overflow: hidden;
      height: 100%;

      .header-information {
        background: rgba(23, 26, 33, 0.50);
        padding: 20px 8px;
        width: 100%;

        h2 {
          font-size: 16px;
          font-weight: 500;
          text-align: center;
        }
      }

      .information-data {
        display: flex;
        flex-direction: column;
        width: 100%;
        align-items: center;
        padding: 20px 8px;
        gap: 12px;

        h3 {
          height: 14px;
          color: var(--primary);
          white-space: nowrap;
        }

        &.important {
          background: rgba(50, 212, 153, 0.10);;
        }

        p {
          span {
            color: var(--primary);
          }
        }
      }
    }

    .session-status {
      justify-self: end;
    }

  }

}
</style>