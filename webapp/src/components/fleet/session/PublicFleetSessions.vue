<template>
  <section class="browser-layout">
    <PublicSessionBrowser class="left" @join="joinPublic" />
    <aside class="panel">
      <button
        class="refresh"
        :style="{ backgroundImage: `url(${blueButton})` }"
        @click="store.refresh()"
      >
        <h3>{{ t("session.refresh") }}</h3>
      </button>
      <div class="online" :style="{ backgroundImage: `url(${greenDisplay})` }">
        <h3>{{ store.state.connectedPlayers }}</h3>
        <p>{{ t("session.player.online") }}</p>
      </div>
      <SessionCard
        :title="t('session.choice.createSession')"
        @click="createSession"
      >
        <p>{{ t("session.choice.createComment") }}</p>
      </SessionCard>
      <h3 class="or">{{ t("session.or") }}</h3>
      <SessionCard
        :title="t('session.choice.joinSession')"
        :background="'linear-gradient(270deg, rgba(50, 144, 212, 0.20) 0%, rgba(50, 144, 212, 0.07) 108.45%)'"
        @click="isModalOpen = true"
      >
        <p>{{ t("session.choice.joinComment") }}</p>
      </SessionCard>
      <modal-template v-model:is-modal-open="isModalOpen">
        <div class="username-wrapper">
          <div class="main-content">
            <h1>{{ t("session.choice.modal.title") }}</h1>
            <p>{{ t("session.choice.modal.comment") }}</p>
            <InputText
              v-model:input-value="sessionId"
              placeholder="42B69X"
              @validate="joinByCode"
            />
          </div>
          <button class="big-button" @click="joinByCode">
            <h2>{{ t("session.choice.modal.button") }}</h2>
          </button>
        </div>
      </modal-template>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { PropType, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import SessionCard from "@/vue/templates/SessionCard.vue";
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import InputText from "@/vue/form/InputText.vue";
import PublicSessionBrowser from "@/components/fleet/session/PublicSessionBrowser.vue";
import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";
import { AlertType } from "@/vue/alert/Alert.ts";
import { alertProvider } from "@/main.ts";
import blueButton from "@/assets/backgrounds/blue-button.svg";
import greenDisplay from "@/assets/backgrounds/green-display.svg";

const { t } = useI18n();
const store = PublicSessionsStore;
const isModalOpen = ref<boolean>(false);
const sessionId = ref<string>("");

const props = defineProps({
  session: { type: Object as PropType<Fleet>, required: true },
});

function joinPublic(id: string) {
  props.session.joinSession(id);
}

function createSession() {
  props.session.joinSession("");
}

async function joinByCode() {
  if (sessionId.value.length == 0) {
    alertProvider.sendAlert({
      content: t("alert.emptySession.content"),
      title: t("alert.emptySession.title"),
      type: AlertType.WARNING,
    });
    return;
  }
  await props.session.joinSession(sessionId.value);
  isModalOpen.value = false;
}

watch(isModalOpen, (previous) => {
  if (previous) {
    sessionId.value = "";
  }
});

watch(sessionId, () => {
  sessionId.value = sessionId.value.toUpperCase();
});
</script>

<style scoped lang="scss">
.browser-layout {
  display: flex;
  gap: 18px;
  height: 100%;
  box-sizing: border-box;

  .left {
    flex: 1;
    min-width: 0;
  }

  .panel {
    width: 256px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    overflow-y: auto;

    .refresh {
      all: unset;
      cursor: pointer;
      background-size: cover;
      background-repeat: no-repeat;
      width: 256px;
      height: 90px;
      display: flex;
      justify-content: center;
      align-items: center;
      box-sizing: border-box;

      &:hover {
        scale: 1.01;
      }
    }

    .online {
      background-size: cover;
      background-repeat: no-repeat;
      width: 256px;
      height: 78px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;

      h3 {
        color: var(--primary);
      }
    }

    .or {
      color: var(--secondary-text);
    }

    .username-wrapper {
      background: var(--secondary-background);
      border-radius: 5px;
      overflow: hidden;
      width: 400px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;

      .main-content {
        padding: 50px 14px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        box-sizing: border-box;

        h1 {
          color: var(--primary);
          font-size: 40px;
          font-family: BrushTip, sans-serif;
          text-align: center;
        }

        p {
          color: var(--secondary-text);
          font-size: 14px;
          line-height: 20px;
          text-align: center;
        }
      }

      button.big-button {
        all: unset;
        cursor: pointer;
        width: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        padding: 40px;
        background: linear-gradient(
          0deg,
          rgba(50, 144, 212, 0.2) 0%,
          rgba(50, 144, 212, 0.07) 108.45%
        );
        box-sizing: border-box;
        gap: 15px;

        h2 {
          text-align: center;
          font-size: 20px;
        }
      }
    }
  }
}
</style>
