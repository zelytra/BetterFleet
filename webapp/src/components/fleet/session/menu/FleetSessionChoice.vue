<template>
  <section class="choice-wrapper">
    <SessionCard
      :title="t('session.choice.createSession')"
      @click="createSession"
    >
      <p>{{ t("session.choice.createComment") }}</p>
    </SessionCard>
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
            @validate="joinSession"
          />
        </div>
        <button class="big-button" @click="joinSession">
          <h2>{{ t("session.choice.modal.button") }}</h2>
        </button>
      </div>
    </modal-template>
  </section>
</template>

<script setup lang="ts">
import SessionCard from "@/vue/templates/SessionCard.vue";
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { PropType, ref, watch } from "vue";
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import InputText from "@/vue/form/InputText.vue";
import { AlertType } from "@/vue/alert/Alert.ts";
import { alertProvider } from "@/main.ts";

const { t } = useI18n();
const isModalOpen = ref<boolean>(false);
const sessionId = ref<string>("");

const props = defineProps({
  session: { type: Object as PropType<Fleet>, required: true },
});

async function joinSession() {
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

function createSession() {
  props.session.joinSession("");
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
.choice-wrapper {
  display: flex;
  justify-content: center;
  gap: 10%;
  height: 100%;
  align-items: center;
  transition: all;
}
</style>
