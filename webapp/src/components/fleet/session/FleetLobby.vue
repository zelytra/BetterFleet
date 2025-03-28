<template>
  <section class="lobby-wrapper">
    <BannerTemplate>
      <template #content>
        <div class="header-content">
          <img src="../../../assets/icons/sot.svg" />
          <div class="title-content">
            <p>{{ session.sessionName }}</p>
            <div class="id-wrapper">
              <p class="id">
                {{ t("session.id") + ": " }}
                <span
                  @click="copyIdToClipboard(session.sessionId.toUpperCase())"
                  >{{ session.sessionId.toUpperCase() }}</span
                >
              </p>
              <img
                src="../../../assets/icons/clipboard.svg"
                alt="copy-button"
                @click="copyIdToClipboard(session.sessionId.toUpperCase())"
              />
              <transition>
                <p v-if="displayIdCopy">{{ t("session.idCopy") }}</p>
              </transition>
            </div>
          </div>
        </div>
      </template>
      <template #left-content>
        <button
          v-if="UserStore.player.isMaster"
          :class="{
            'session-starter': true,
            pending: session.getReadyPlayers().length != session.players.length,
          }"
          @click="confirmationStartSession()"
        >
          {{ t("session.run") }}
        </button>
      </template>
    </BannerTemplate>
    <div class="lobby-content">
      <div class="player-table">
        <div v-if="computedSession.servers.size > 0">
          <ServerContainer
            v-for="[hash, server] of getFilteredSotServer()"
            :key="hash"
            :server="
              hash.toUpperCase() +
              (!server.location ? '' : ' | ' + server.location)
            "
            :color="server.color"
            :player-count="server.connectedPlayers.length"
          >
            <PlayerFleet
              v-for="player in server.connectedPlayers.sort((a, b) => {
                return a.isMaster === b.isMaster ? 0 : a.isMaster ? -1 : 1;
              })"
              :key="player.username"
              :player="player"
              @click.right.prevent="openContextMenu($event, player)"
            />
          </ServerContainer>
        </div>
        <PlayerFleet
          v-for="player in getFilteredPlayerList()"
          :key="player.username"
          :player="player"
          class="player-fleet-card"
          @click.right.prevent="openContextMenu($event, player)"
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
              <p>
                {{ session.players.filter((x) => x.isReady).length }} /
                <span>{{ session.players.length }}</span>
              </p>
            </div>
            <div class="information-data">
              <h3>{{ t("session.informations.tryNumber") }}</h3>
              <p>
                {{ session.stats.tryAmount }}
              </p>
            </div>
          </div>
          <button class="session-status" @click="leaveConfirmation = true">
            <p>{{ t("session.leave") }}</p>
          </button>
        </div>
      </div>
    </div>
    <transition>
      <SessionCountdown v-if="UserStore.player.countDown" :session="session" />
    </transition>
    <ConfirmationModal
      v-model:is-confirmation-modal-open="launchConfirmation"
      :cancel="t('modal.confirm.launch.cancel')"
      :confirm="t('modal.confirm.launch.confirm')"
      :content="t('modal.confirm.launch.content')"
      :title="t('modal.confirm.launch.title')"
      cancel-class="important"
      confirm-class="warning"
      title-class="warning"
      @on-confirm="startSession"
    />
    <ConfirmationModal
      v-model:is-confirmation-modal-open="leaveConfirmation"
      :cancel="t('modal.confirm.leave.cancel')"
      :confirm="t('modal.confirm.leave.confirm')"
      :content="t('modal.confirm.leave.content')"
      :title="t('modal.confirm.leave.title')"
      cancel-class="information"
      confirm-class="important"
      title-class="important"
      @on-confirm="session.leaveSession()"
    />
    <MasterContextMenu
      ref="contextMenu"
      v-model:display="displayContextMenu"
      :menu="masterContextMenu"
      @action="onContextAction"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onUnmounted, PropType, ref } from "vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import PlayerFleet from "@/vue/fleet/PlayerFleet.vue";
import { useI18n } from "vue-i18n";
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import SessionCountdown from "@/components/fleet/session/SessionCountdown.vue";
import ServerContainer from "@/vue/templates/ServerContainer.vue";
import ConfirmationModal from "@/vue/form/ConfirmationModal.vue";
import MasterContextMenu from "@/vue/context/MasterContextMenu.vue";
import { ContextMenu, MenuData } from "@/vue/context/ContextMenu.ts";
import { Player } from "@/objects/fleet/Player.ts";
import { WebSocketMessageType } from "@/objects/fleet/WebSocet.ts";

const { t } = useI18n();
const displayIdCopy = ref<boolean>(false);
const launchConfirmation = ref<boolean>(false);
const leaveConfirmation = ref<boolean>(false);
const displayContextMenu = ref<boolean>(false);
const contextMenu = ref();
const masterContextMenu = ref<ContextMenu<string>>();
const contextMenuData: MenuData[] = [
  {
    display: t("contextMenu.master.promote"),
    key: "promote",
    class: "green",
  },
  {
    display: t("contextMenu.master.demote"),
    key: "demote",
    class: "blue",
  },
  {
    display: t("contextMenu.master.kick"),
    key: "kick",
    class: "red",
  },
];
const props = defineProps({
  session: {
    type: Object as PropType<Fleet>,
    required: true,
  },
});

const keepAlive: number = setInterval(() => {
  if (props.session) {
    props.session.sendKeepAlive();
  }
}, 30000);

onUnmounted(() => {
  clearInterval(keepAlive);
});

function updateStatus() {
  UserStore.player.isReady = !UserStore.player.isReady;
  props.session.updateToSession();
}

defineEmits(["update:selected-value"]);
const computedSession = computed({
  get: (): Fleet => props.session,
  set: (): void => {},
});

function confirmationStartSession() {
  if (props.session.getReadyPlayers().length != props.session.players.length) {
    launchConfirmation.value = true;
  } else {
    startSession();
  }
}

function startSession() {
  // Yes I know never trust the client... IT'S AN ALPHA !! (or a beta I don't care)
  if (!UserStore.player.isMaster) {
    return;
  }
  props.session!.runCountDown();
}

function getFilteredPlayerList() {
  const removedPlayer: string[] = [];
  for (const player of props.session!.players) {
    computedSession.value.servers.forEach((value) => {
      if (
        value.connectedPlayers.filter((x) => x.username == player.username)
          .length > 0
      ) {
        removedPlayer.push(player.username);
        return;
      }
    });
  }
  return computedSession.value.players
    .filter((x) => !removedPlayer.includes(x.username))
    .sort((a, b) => {
      return a.isMaster === b.isMaster ? 0 : a.isMaster ? -1 : 1;
    });
}

function getFilteredSotServer() {
  return new Map(
    [...props.session.servers].sort((a, b) => {
      return b[1].connectedPlayers.length - a[1].connectedPlayers.length;
    }),
  );
}

function copyIdToClipboard(id: string) {
  navigator.clipboard.writeText(id);
  displayIdCopy.value = true;
  setTimeout(() => (displayIdCopy.value = false), 2000);
}

function openContextMenu(event: any, player: Player) {
  if (
    !UserStore.player.isMaster ||
    player.username == UserStore.player.username
  ) {
    return;
  }

  contextMenu.value.setPos(event);
  masterContextMenu.value = {
    title: t("contextMenu.master.title") + ": " + player.username,
    data: contextMenuData,
    metaData: player.username,
  };
  displayContextMenu.value = true;
}

function onContextAction(action: string) {
  if (!props.session) {
    return;
  }
  switch (action) {
    case "promote": {
      props.session.playerAction(
        {
          sessionId: props.session.sessionId,
          username: masterContextMenu.value!.metaData,
        },
        WebSocketMessageType.PROMOTE_PLAYER,
      );
      break;
    }
    case "demote": {
      props.session.playerAction(
        {
          sessionId: props.session.sessionId,
          username: masterContextMenu.value!.metaData,
        },
        WebSocketMessageType.DEMOTE_PLAYER,
      );
      break;
    }
    case "kick": {
      props.session.playerAction(
        {
          sessionId: props.session.sessionId,
          username: masterContextMenu.value!.metaData,
        },
        WebSocketMessageType.KICK_PLAYER,
      );
      break;
    }
  }
  displayContextMenu.value = false;
}
</script>

<style scoped lang="scss">
.lobby-wrapper {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;

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

    .id-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;

      img {
        width: 24px;
        height: 24px;
        cursor: pointer;
      }

      p {
        font-family: BrushTip, sans-serif;
        font-size: 20px;
        font-weight: 400;
        height: 16px;
      }
    }

    p {
      font-family: BrushTip, sans-serif;
      font-size: 31px;

      &.id {
        font-family: Windlass, sans-serif;
        font-weight: 400;
        font-size: 16px;

        span {
          cursor: pointer;
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
    white-space: nowrap;

    &.pending {
      background: linear-gradient(
        270deg,
        rgba(212, 147, 50, 0.2) 0%,
        rgba(212, 147, 50, 0) 108.45%
      );
    }
  }

  .lobby-content {
    margin-top: 12px;
    height: calc(100% - 128px); // Minus header height
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

      .player-fleet-card {
        margin: 0 8px;
      }
    }

    .lobby-details {
      width: 10%;
      min-width: 170px;
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
