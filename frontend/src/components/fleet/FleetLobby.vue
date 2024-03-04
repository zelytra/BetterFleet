<template>
  <section class="lobby-wrapper">
    <BannerTemplate>
      <template #content>
        <div class="header-content">
          <img src="@/assets/icons/sot.svg" />
          <div class="title-content">
            <p>{{ session.sessionName }}</p>
            <p class="id">
              {{ t("session.id") + ": " }}
              <span>{{ session.sessionId.toUpperCase() }}</span>
            </p>
          </div>
        </div>
      </template>
      <template #left-content>
        <button class="session-starter">TODO</button>
      </template>
    </BannerTemplate>
    <div class="lobby-content">
      <div class="player-table">
        <PlayerFleet
          v-for="player in computedsession.players.sort((a, b) => {
            return a.isMaster === b.isMaster ? 0 : a.isMaster ? -1 : 1;
          })"
          :player="player"
        />
      </div>
      <div class="lobby-details">
        <button
          :class="{ 'ready-button': true, not: !UserStore.player.isReady }"
          @click="updateStatus"
        >
          <p v-if="UserStore.player.isReady">{{ t("session.player.ready") }}</p>
          <p v-else>{{ t("session.player.notReady") }}</p>
        </button>
        <div class="details-content">
          <div class="top-content">
            <div class="header-information">
              <h2>{{ t("session.informations.title") }}</h2>
            </div>

            <div class="information-data">
              <h3>{{ t("session.informations.totalPlayer") }}</h3>
              <p>{{ session.players.length }}</p>
            </div>

            <div class="information-data important">
              <h3>{{ t("session.informations.totalPlayer") }}</h3>
              <p>
                {{ session.players.filter((x) => x.isReady).length }} /
                <span>{{ session.players.length }}</span>
              </p>
            </div>
          </div>
          <button class="session-status" @click="session.leaveSession()">
            <p>{{ t("session.leave") }}</p>
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, PropType } from "vue";
import { Fleet } from "@/objects/Fleet.ts";
import PlayerFleet from "@/vue/fleet/PlayerFleet.vue";
import { useI18n } from "vue-i18n";
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";

const { t } = useI18n();
const props = defineProps({
  session: {
    type: Object as PropType<Fleet>,
    required: true,
  },
});

function updateStatus() {
  UserStore.player.isReady = !UserStore.player.isReady;
  props.session.updateToSession();
}

const emits = defineEmits(["update:selected-value"]);
const computedsession = computed({
  get: (): Fleet => props.session,
  set: (): void => {},
});
</script>

<style scoped lang="scss">
.lobby-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;

  .header-content {
    display: flex;
    height: 100%;
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

      &.id {
        font-family: Windlass, sans-serif;
        font-weight: 400;
        font-size: 16px;

        span {
          user-select: all;
          color: var(--primary);
        }
      }
    }
  }

  button.session-starter {
    all: unset;
    cursor: pointer;
    height: 100%;
    background: linear-gradient(
      270deg,
      rgba(50, 212, 153, 0.2) 0%,
      rgba(50, 212, 153, 0) 108.45%
    );
    padding: 0 16px;
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
      border-radius: 5px;
      align-items: center;
      box-sizing: border-box;
      overflow: hidden;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;

      .ready-button {
        all: unset;
        border-radius: 5px;
        background: linear-gradient(
          0deg,
          rgba(50, 212, 153, 0.2) -14.61%,
          rgba(50, 212, 153, 0.07) 167.42%
        );
        width: 100%;
        height: 80px;
        margin-bottom: 8px;
        text-align: center;
        cursor: pointer;

        &.not {
          background: linear-gradient(
            0deg,
            rgba(212, 50, 50, 0.2) -14.61%,
            rgba(212, 50, 50, 0.07) 167.42%
          );
        }
      }

      .details-content {
        background: var(--secondary-background);
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;

        .top-content {
          .header-information {
            background: rgba(23, 26, 33, 0.5);
            padding: 20px 0;
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
            padding: 20px 0;
            gap: 12px;

            h3 {
              height: 14px;
              color: var(--primary);
              white-space: nowrap;
            }

            &.important {
              background: rgba(50, 212, 153, 0.1);
            }

            p {
              span {
                color: var(--primary);
              }
            }
          }
        }

        .session-status {
          all: unset;
          cursor: pointer;
          padding: 20px 0;
          width: 100%;
          text-align: center;
          background: linear-gradient(
            0deg,
            rgba(212, 50, 50, 0.2) 0%,
            rgba(212, 50, 50, 0) 97.89%
          );
        }
      }
    }
  }
}
</style>
