<template>
  <div :class="{'player-fleet-wrapper':true,'is-player':UserStore.player.username == player.username}">
    <div class="content username">
      <span class="user-icon" :style="{backgroundColor:Utils.generateRandomColor()}">{{
          player.username.charAt(0)
        }}</span>
      <p>{{ player.username }}</p>
      <img v-if="player.device == PlayerDevice.XBOX" src="@/assets/icons/xbox.svg"/>
      <img v-if="player.device == PlayerDevice.PLAYSTATION" src="@/assets/icons/playstation.svg"/>
      <img v-if="player.isMaster" src="@/assets/icons/key.svg"/>
    </div>
    <div class="content">
      <p :class="{status:true,offline:player.status == PlayerStates.CLOSED }">
        {{ t('session.player.status.' + Fleet.getFormatedStatus(player)) }}
      </p>
    </div>
    <div class="content">
      <span class="player-status ready" v-if="player.isReady">{{ t('session.player.ready') }}</span>
      <span class="player-status not-ready" v-else>{{ t('session.player.notReady') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import {PropType} from "vue";
import {Fleet} from "@/objects/fleet/Fleet.ts";
import {useI18n} from "vue-i18n";
import {Utils} from "@/objects/utils/Utils.ts";
import {Player, PlayerDevice, PlayerStates} from "@/objects/fleet/Player.ts";
import {UserStore} from "@/objects/stores/UserStore.ts";

const {t} = useI18n()
defineProps({
  player: {
    type: Object as PropType<Player>,
    required: true
  }
})
</script>

<style scoped lang="scss">
.player-fleet-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--primary-background-static);
  padding: 8px 13px;
  border-radius: 5px;

  &.is-player{
    border: 1px solid var(--primary);
    background: rgba(50, 212, 153, 0.10);


  }

  .content {
    display: flex;
    align-items: center;
    gap: 15px;

    &.username {
      width: 200px;

      .user-icon {
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: Rubik, sans-serif;
        font-size: 18px;
        padding: 4px;
        font-weight: 500;
      }
    }

    p, span {
      font-family: Rubik, sans-serif;

      &.status {
        color: var(--primary);

        &.offline {
          color: var(--secondary-text);
        }
      }
    }

    .player-status {
      padding-right: 24px;
      position: relative;
      width: 100px;
      text-align: end;

      &:after {
        content: '';
        width: 12px;
        height: 12px;
        border-radius: 50%;
        position: absolute;
        right: 0;
        top: 50%;
        transform: translate(0, -50%);
      }

      &.ready {
        color: var(--information);

        &:after {
          background: var(--information);
        }
      }

      &.not-ready {
        color: var(--important);

        &:after {
          background: var(--important);
        }
      }
    }
  }

}
</style>