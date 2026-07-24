<template>
  <section class="lobby-wrapper">
    <BannerTemplate :background="bannerUrl(session.banner)">
      <template #content>
        <div class="header-content">
          <img src="../../../assets/icons/sot.svg" />
          <div class="title-content">
            <div class="name-wrapper">
              <template v-if="isRenaming">
                <input
                  ref="renameInput"
                  v-model="draftName"
                  class="rename-input"
                  :maxlength="SESSION_NAME_MAX_LENGTH"
                  :placeholder="t('session.rename.placeholder')"
                  @keyup.enter="confirmRename"
                  @keyup.esc="cancelRename"
                  @blur="confirmRename"
                />
              </template>
              <template v-else>
                <p>{{ session.sessionName }}</p>
                <img
                  v-if="UserStore.player.isMaster"
                  class="rename-button"
                  src="../../../assets/icons/edit.svg"
                  :alt="t('session.rename.label')"
                  :title="t('session.rename.label')"
                  @click="startRename"
                />
              </template>
            </div>
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
    <!-- Guided diagnostic (#688): shows once when detection stays silent in game. -->
    <div v-if="detectionPrompt.visible" class="detection-banner">
      <p>{{ t("diagnostic.banner") }}</p>
      <div class="actions">
        <button type="button" class="run" @click="runGuidedDiagnostic()">
          {{ t("diagnostic.run") }}
        </button>
        <button type="button" class="later" @click="dismissDetectionPrompt()">
          {{ t("diagnostic.dismiss") }}
        </button>
      </div>
    </div>
    <!-- Shareable recap (#685): appears once when the alliance converges onto one server. -->
    <div v-if="sessionRecap.visible && sessionRecap.data" class="recap-card">
      <div class="summary">
        <span class="icon">⚓</span>
        <div class="text">
          <p class="title">{{ t("session.recap.title") }}</p>
          <p class="stats">
            <span
              >{{ t("session.recap.tries") }}:
              {{ sessionRecap.data.tries }}</span
            >
            <span
              >{{ t("session.recap.pirates") }}:
              {{ sessionRecap.data.players }}</span
            >
            <span>{{ t("session.recap.duration") }}: {{ recapDuration }}</span>
            <span v-if="recapFlag" class="flag">{{ recapFlag }}</span>
          </p>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="copy" @click="copyRecap()">
          {{
            recapCopied ? t("session.recap.copied") : t("session.recap.copy")
          }}
        </button>
        <button
          type="button"
          class="dismiss"
          :title="t('session.recap.dismiss')"
          @click="dismissRecap()"
        >
          ✕
        </button>
      </div>
    </div>
    <div class="lobby-content">
      <div class="player-table">
        <div v-if="computedSession.servers.size > 0" class="server-list">
          <ServerContainer
            v-for="[hash, server] of getFilteredSotServer()"
            :key="hash"
            :server="
              hash.toUpperCase() +
              (!server.location ? '' : ' | ' + server.location)
            "
            :color="server.color"
            :player-count="server.connectedPlayers.length"
            :address="server.ip ? server.ip + ':' + server.port : ''"
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
        <div v-if="statsHint && !statsHintDismissed" class="stats-hint">
          <p>
            🕑
            {{
              statsHint.nowRate !== null
                ? t("session.statsHint.text", {
                    range: statsHint.localRange,
                    best: statsHint.bestRate,
                    now: statsHint.nowRate,
                  })
                : t("session.statsHint.textNoNow", {
                    range: statsHint.localRange,
                    best: statsHint.bestRate,
                  })
            }}
          </p>
          <button
            type="button"
            class="dismiss"
            :aria-label="t('session.statsHint.dismiss')"
            @click="statsHintDismissed = true"
          >
            ✕
          </button>
        </div>
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
            <div
              v-if="UserStore.player.isMaster"
              class="visibility"
              :title="
                t('session.visibility.label') +
                ' — ' +
                t('session.visibility.description')
              "
            >
              <SingleSelect
                :data="visibilityData"
                @update:data="onVisibilityChange"
              />
            </div>
            <label v-if="UserStore.player.isMaster" class="auto-set-sail">
              <input
                type="checkbox"
                :checked="session.autoSetSail"
                @change="onToggleAutoSetSail"
              />
              <div class="label-wrapper">
                <p>{{ t("session.autoSetSail.label") }}</p>
                <p class="description">
                  {{ t("session.autoSetSail.description") }}
                </p>
              </div>
            </label>
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
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  PropType,
  reactive,
  ref,
  watch,
} from "vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import PlayerFleet from "@/vue/fleet/PlayerFleet.vue";
import { useI18n } from "vue-i18n";
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import SessionCountdown from "@/components/fleet/session/SessionCountdown.vue";
import ServerContainer from "@/vue/templates/ServerContainer.vue";
import ConfirmationModal from "@/vue/form/ConfirmationModal.vue";
import MasterContextMenu from "@/vue/context/MasterContextMenu.vue";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import { SingleSelectInterface } from "@/vue/form/Inputs.ts";
import { bannerUrl } from "@/objects/fleet/Banners.ts";
import { ContextMenu, MenuData } from "@/vue/context/ContextMenu.ts";
import { Player } from "@/objects/fleet/Player.ts";
import { WebSocketMessageType } from "@/objects/fleet/WebSocet.ts";
import lockIcon from "@/assets/icons/lock.svg";
import lockOpenIcon from "@/assets/icons/lock_open.svg";
import router from "@/router";
import {
  detectionPrompt,
  dismissDetectionPrompt,
} from "@/objects/fleet/DetectionWatchdog.ts";
import {
  AllianceHint,
  computeHint,
  fetchAllianceStats,
  utcHourToLocal,
} from "@/objects/fleet/AllianceHint.ts";
import {
  buildShareText,
  countryFlagEmoji,
  dismissRecap,
  formatClock,
  sessionRecap,
} from "@/objects/fleet/SessionRecap.ts";

const { t } = useI18n();

// Guided diagnostic (#688): the banner's action lands on the Reports page, which auto-runs the
// capture and pre-fills the message; sending stays the player's call.
function runGuidedDiagnostic(): void {
  dismissDetectionPrompt();
  router.push({ name: "Report", query: { diagnostic: "auto" } });
}

// Best-window hint from the anonymous alliance stats (#683): fetched once (module-cached an hour),
// hidden whenever the data is too thin, dismissable for the session.
const statsHint = ref<AllianceHint | null>(null);
const statsHintDismissed = ref(false);
onMounted(async () => {
  const payload = await fetchAllianceStats();
  statsHint.value = computeHint(
    payload,
    new Date().getUTCHours(),
    utcHourToLocal,
  );
});
// Shareable recap (#685): the card's numbers, its region flag, and the copy-to-Discord confirmation.
const recapFlag = computed(() =>
  countryFlagEmoji(sessionRecap.data?.countryCode),
);
const recapDuration = computed(() =>
  formatClock(sessionRecap.data?.durationMs ?? 0),
);
const recapCopied = ref(false);
function copyRecap(): void {
  if (!sessionRecap.data) return;
  navigator.clipboard.writeText(buildShareText(sessionRecap.data, t));
  recapCopied.value = true;
  setTimeout(() => (recapCopied.value = false), 2000);
}

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

function onToggleAutoSetSail(event: Event) {
  props.session.setAutoSetSail((event.target as HTMLInputElement).checked);
}

// Mirrors SessionNameFilter.MAX_LENGTH: the backend caps the name anyway, this
// just stops the field from accepting what would be silently truncated.
const SESSION_NAME_MAX_LENGTH = 40;
const isRenaming = ref<boolean>(false);
const draftName = ref<string>("");
const renameInput = ref<HTMLInputElement>();

function startRename() {
  // Empty when the session still carries its default name, so the placeholder
  // shows and the master types over nothing rather than deleting a name they
  // never chose.
  draftName.value = props.session.customName;
  isRenaming.value = true;
  nextTick(() => renameInput.value?.select());
}

function confirmRename() {
  // Enter confirms and the blur that follows lands here again; Escape closes the
  // field first, so this no-ops rather than renaming what the master cancelled.
  if (!isRenaming.value) {
    return;
  }
  isRenaming.value = false;
  const name = draftName.value.trim();
  if (name === props.session.customName) {
    return; // nothing to say
  }
  props.session.renameSession(name);
}

function cancelRename() {
  isRenaming.value = false;
}

// Open padlock = listed in the public browser, closed = unlisted — the same
// language the browser's filter and session rows use.
const visibilityData = reactive<SingleSelectInterface>({
  data: [
    {
      id: "public",
      display: t("session.visibility.public"),
      image: lockOpenIcon,
    },
    {
      id: "private",
      display: t("session.visibility.private"),
      image: lockIcon,
    },
  ],
});

// The session's visibility is owned by the backend and broadcast to everyone, so
// the dropdown follows the fleet rather than holding its own state: a change made
// by another master (or a rejected one) still lands on the right option here.
watch(
  () => props.session.isPrivate,
  (isPrivate) => {
    visibilityData.selectedValue = visibilityData.data.find(
      (option) => option.id === (isPrivate ? "private" : "public"),
    );
  },
  { immediate: true },
);

function onVisibilityChange(data: SingleSelectInterface) {
  props.session.setVisibility(data.selectedValue?.id === "private");
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

  // The session banner keeps its full 120px however tight the column gets — it must never fold to
  // make room for the detection strip; the lobby content below yields that space instead.
  :deep(.header-wrapper) {
    flex-shrink: 0;
  }

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

    .title-content {
      // Lets the name shrink instead of pushing the header wider than the banner.
      min-width: 0;
    }

    .name-wrapper {
      display: flex;
      align-items: center;
      gap: 10px;
      min-height: 40px; // the name and the input are the same height, so nothing jumps

      // A 40-char name is wider than a narrow window leaves, and the reserved lane only stops it
      // from starting under the select — this is what stops it from spilling into it.
      > p {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      // Without this the pencil inherits the 64px of the SoT crest above.
      img.rename-button {
        width: 18px;
        height: 18px;
        cursor: pointer;
        opacity: 0.55;

        &:hover {
          opacity: 1;
        }
      }

      // Renaming happens in place, so the field wears the title's own type.
      .rename-input {
        background: transparent;
        border: none;
        border-bottom: 1px solid var(--primary);
        outline: none;
        padding: 0;
        font-family: BrushTip, sans-serif;
        font-size: 31px;
        color: var(--primary-text);
        // Wide enough to show a full-length (40 char) name rather than scrolling
        // it out of sight while it is being typed; the banner has room to spare.
        width: 400px;
        max-width: 100%;

        &::placeholder {
          color: var(--secondary-text);
        }
      }
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

  // The master's two session-level controls, sitting together at the right of the banner.
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

  // Guided diagnostic offer (#688): a quiet warning strip between the banner and the tables.
  .detection-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 5px;
    border: 1px solid rgba(255, 190, 92, 0.45);
    background: rgba(255, 190, 92, 0.08);

    p {
      font-size: 14px;
      color: var(--warning);
    }

    .actions {
      display: flex;
      gap: 8px;

      button {
        all: unset;
        cursor: pointer;
        padding: 6px 14px;
        border-radius: 5px;
        font-size: 13px;

        &.run {
          background: var(--warning);
          color: #241a05;
          font-weight: 600;
        }

        &.later {
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: var(--secondary-text);
        }
      }
    }
  }

  // Shareable recap (#685): a celebratory strip in the same slot as the detection offer (the two are
  // mutually exclusive states), tinted with the success accent rather than the warning one.
  .recap-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    flex-shrink: 0;
    margin-top: 12px;
    padding: 10px 14px;
    border-radius: 5px;
    border: 1px solid rgba(50, 212, 153, 0.45);
    background: rgba(50, 212, 153, 0.08);

    .summary {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;

      .icon {
        font-size: 22px;
      }

      .title {
        font-size: 14px;
        font-weight: 600;
        color: var(--primary);
      }

      .stats {
        display: flex;
        flex-wrap: wrap;
        gap: 4px 14px;
        font-size: 13px;
        color: var(--secondary-text);

        .flag {
          font-size: 15px;
        }
      }
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 8px;

      button {
        all: unset;
        cursor: pointer;
        border-radius: 5px;
        font-size: 13px;

        &.copy {
          padding: 6px 14px;
          background: var(--primary);
          color: #062418;
          font-weight: 600;
        }

        &.dismiss {
          padding: 6px 10px;
          color: var(--secondary-text);
        }
      }
    }
  }

  .lobby-content {
    margin-top: 12px;
    // Fills whatever is left under the banner (and the detection strip, when it shows) and scrolls
    // inside itself. A fixed height here didn't count the strip, so the column overflowed and flex
    // folded the banner above to make room — this pane gives the room instead.
    flex: 1;
    min-height: 0;
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

      // The servers live in this wrapper, so the player-table's own gap sits *around* the group,
      // not between the cards inside it — without this they stacked flush and touched.
      .server-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .player-fleet-card {
        margin: 0 8px;
      }
    }

    .lobby-details {
      width: 10%;
      // 170 fitted this column in French only by luck — 8px to spare — and German overflowed it by
      // 16 the moment the visibility select joined, because every label here wraps in a column this
      // narrow. 20px more costs the player table nothing it notices and buys German 21px of slack.
      min-width: 190px;
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

      // Best-window hint from the alliance stats (#683): quiet, one line, dismissable.
      .stats-hint {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 8px 10px;
        border-radius: 5px;
        border: 1px solid rgba(50, 212, 153, 0.35);
        background: rgba(50, 212, 153, 0.08);

        p {
          flex: 1 1 auto;
          font-size: 12px;
          line-height: 1.45;
          color: var(--secondary-text);
        }

        .dismiss {
          all: unset;
          cursor: pointer;
          font-size: 11px;
          line-height: 1;
          padding: 2px;
          color: var(--secondary-text);

          &:hover {
            color: var(--primary-text);
          }
        }
      }

      .details-content {
        background: var(--secondary-background);
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        min-height: 0; // lets top-content shrink instead of pushing Leave out of the clipped panel

        .top-content {
          // The window is resizable with no minimum height and this panel clips its overflow, so on
          // a short enough window the Leave button — the one control a player must always be able to
          // reach — silently drops below the fold. That predates the visibility select. Now the
          // information area gives way and scrolls instead, and Leave stays put. It does not scroll
          // at the app's default size: measured, 492px of content in 451px was this select's doing
          // and is what the compacting above buys back.
          overflow-y: auto;
          overflow-x: hidden;
          min-height: 0;

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

          // Just the field: no label, no description paragraph. This panel had 59px of slack and
          // the two of them cost 73, which is what pushed the Leave button out of a panel that
          // clips. A padlock reading Publique/Privée carries itself here, next to Auto set sails;
          // the name and the sentence are on the tooltip. 51px, and the height does not move
          // between locales — the field is fixed-height, whereas a "Öffentliche Sitzung" label
          // would have wrapped and put us back over.
          .visibility {
            display: flex;
            flex-direction: column;
            padding: 8px 16px;
            border-top: 1px solid rgba(255, 255, 255, 0.05);
            // The open list is absolutely positioned; without a stacking context of its own it
            // renders behind the rows underneath it.
            position: relative;
            z-index: 1;

            // SingleSelect carries a 250px floor sized for the settings form. This rail is 170px,
            // so the field would run straight out of a panel that clips its overflow — the select
            // has to be allowed to shrink to the space it actually has.
            :deep(.input-wrapper),
            :deep(.dropdown) {
              min-width: 0;
            }
          }

          .auto-set-sail {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 16px;
            cursor: pointer;
            border-top: 1px solid rgba(255, 255, 255, 0.05);

            .label-wrapper {
              display: flex;
              flex-direction: column;
              gap: 4px;
              text-align: left;

              p.description {
                color: var(--secondary-text);
                font-size: 12px;
              }
            }

            input[type="checkbox"] {
              appearance: none;
              border: 1px solid var(--primary);
              border-radius: 4px;
              min-width: 20px;
              width: 20px;
              height: 20px;
              margin-top: 2px;
              display: flex;
              align-items: center;
              justify-content: center;
              cursor: pointer;

              &:before {
                content: "";
                width: 10px;
                height: 10px;
                transform: scale(0);
                background: var(--primary-text);
                clip-path: polygon(
                  14% 44%,
                  0 65%,
                  50% 100%,
                  100% 16%,
                  80% 0%,
                  43% 62%
                );
                transform-origin: bottom left;
              }

              &:checked {
                background: var(--primary);
                border: 2px solid var(--primary);

                &:before {
                  transform: scale(1);
                }
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
