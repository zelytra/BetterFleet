<template>
  <section class="browser-layout">
    <PublicSessionBrowser
      class="left"
      @join="joinPublic"
      @code="isModalOpen = true"
    />
    <div class="side-container">
      <MenuActionBar
        v-model:is-modal-open="isModalOpen"
        @create-session="createSession"
      />
    </div>
  </section>
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
</template>

<script setup lang="ts">
import { PropType, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import InputText from "@/vue/form/InputText.vue";
import PublicSessionBrowser from "@/components/fleet/session/PublicSessionBrowser.vue";
import MenuActionBar from "@/components/fleet/session/MenuActionBar.vue";
import { AlertType } from "@/vue/alert/Alert.ts";
import { alertProvider } from "@/main.ts";

const { t } = useI18n();
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
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;

  .left {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .side-container {
    width: 256px;
    flex-shrink: 0;
    // On a tall window the cards flex to fill and nothing scrolls; on a short one the panel
    // scrolls rather than silently clipping the Discord card. Safe now that hovering brightens
    // instead of scaling — a scale grew the card past the column and forced a scrollbar.
    overflow-y: auto;
    overflow-x: hidden;
  }
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
</style>
