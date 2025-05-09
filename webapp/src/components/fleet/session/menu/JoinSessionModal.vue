<template>
  <modal-template v-model:is-modal-open="isModalOpen">
    <div class="username-wrapper">
      <div class="main-content">
        <h1>{{ t("session.choice.modal.title") }}</h1>
        <p>{{ t("session.choice.modal.comment") }}</p>
        <InputText
          v-model:input-value="sessionId"
          placeholder="42B69X"
          @validate="emits('validate', sessionId)"
        />
      </div>
      <button class="big-button" @click="emits('validate', sessionId)">
        <h2>{{ t("session.choice.modal.button") }}</h2>
      </button>
    </div>
  </modal-template>
</template>

<script setup lang="ts">
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import InputText from "@/vue/form/InputText.vue";
import { ref, watch } from "vue";
import { useI18n } from "vue-i18n";

const isModalOpen = defineModel<boolean>("isModalOpen", {
  required: false,
  default: () => false,
});
const { t } = useI18n();
const sessionId = ref<string>("");
const emits = defineEmits<{
  (e: "validate", id: string): void;
}>();

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
.username-wrapper {
  background: var(--secondary-background);
  border-radius: 5px;
  overflow: hidden;
  width: 400px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 15px;
  //margin: 40px;

  .main-content {
    padding: 50px 14px;
    display: flex;
    flex-direction: column;
    justify-content: center;
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

  button {
    all: unset;
    cursor: pointer;
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px 40px;
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

    p {
      text-align: center;
      color: var(--secondary-text);
      font-size: 16px;
    }
  }
}
</style>
