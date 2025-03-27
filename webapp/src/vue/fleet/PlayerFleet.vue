<template>
  <div
    :class="{
      'player-fleet-wrapper': true,
      'is-player': UserStore.player.username == player.username,
    }"
  >
    <div class="content username">
      <span
        class="user-icon"
        :style="{ backgroundColor: Utils.generateRandomColor() }"
        >{{ player.username.charAt(0).toUpperCase() }}</span
      >
      <p>{{ player.username }}</p>

      <!-- Device user icon -->
      <img
        v-if="player.device == PlayerDevice.XBOX"
        src="@/assets/icons/xbox.svg"
      />
      <img
        v-if="player.device == PlayerDevice.PLAYSTATION"
        src="@/assets/icons/playstation.svg"
      />

      <!-- Contributor user icon -->
      <div class="contrib-wrapper">
        <img
          v-if="contributor == ContributorType.DEVELOPER"
          class="contributor"
          src="@/assets/icons/contributors/developer.svg"
          alt="developer"
          @mouseenter="displayContrib = true"
          @mouseleave="displayContrib = false"
        />
        <img
          v-if="contributor == ContributorType.DESIGNER"
          class="contributor"
          src="@/assets/icons/contributors/designer.svg"
          alt="designer"
          @mouseenter="displayContrib = true"
          @mouseleave="displayContrib = false"
        />
        <img
          v-if="contributor == ContributorType.TRANSLATOR"
          class="contributor"
          src="@/assets/icons/contributors/translator.svg"
          alt="translator"
          @mouseenter="displayContrib = true"
          @mouseleave="displayContrib = false"
        />
        <img
          v-if="contributor == ContributorType.ALPHA_TESTER"
          class="contributor"
          src="@/assets/icons/contributors/alpha-tester.svg"
          alt="alpha-tester"
          @mouseenter="displayContrib = true"
          @mouseleave="displayContrib = false"
        />
        <span v-if="displayContrib && contributor">{{
          t("session.contributor." + contributor.toLowerCase())
        }}</span>
      </div>

      <img v-if="player.isMaster" src="@/assets/icons/key.svg" />
    </div>
    <div class="content">
      <p
        :class="{ status: true, offline: player.status == PlayerStates.CLOSED }"
      >
        {{ t("session.player.status." + Fleet.getFormatedStatus(player)) }}
      </p>
    </div>
    <div class="content">
      <span v-if="player.isReady" class="player-status ready">{{
        t("session.player.ready")
      }}</span>
      <span v-else class="player-status not-ready">{{
        t("session.player.notReady")
      }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUpdated, PropType, ref } from "vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { useI18n } from "vue-i18n";
import { Utils } from "@/objects/utils/Utils.ts";
import { Player, PlayerDevice, PlayerStates } from "@/objects/fleet/Player.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import {
  ContributorProvider,
  ContributorType,
} from "@/objects/fleet/Contributor.ts";

const { t } = useI18n();
const displayContrib = ref<boolean>(false);
const props = defineProps({
  player: {
    type: Object as PropType<Player>,
    required: true,
  },
});
const contributor = ref<ContributorType | null>(
  ContributorProvider.getPlayerContrib(props.player.username),
);

onUpdated(() => {
  contributor.value = ContributorProvider.getPlayerContrib(
    props.player.username,
  );
});
</script>

<style scoped lang="scss">
.player-fleet-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--primary-background-static);
  padding: 8px 13px;
  border-radius: 5px;
  position: relative;

  &.is-player {
    border: 1px solid var(--primary);
    //background: rgba(50, 212, 153, 0.10);
  }

  .content {
    display: flex;
    align-items: center;
    gap: 15px;

    &.username {
      width: 240px;

      .user-icon {
        border-radius: 50%;
        width: 24px;
        height: 24px;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 18px;
        flex-shrink: 0;
        padding: 4px;
        font-weight: 500;
      }

      p {
        white-space: nowrap;
      }

      .contrib-wrapper {
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;

        img.contributor {
          width: 32px;
          position: relative;
        }

        span {
          position: absolute;
          top: 50%;
          left: 90px;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          z-index: 99;
          background: var(--primary);
          padding: 4px 8px;
          border-radius: 5px;
          color: white;
          font-size: 14px;
        }
      }
    }

    p,
    span {
      &.status {
        color: var(--primary);
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);

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
        content: "";
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
