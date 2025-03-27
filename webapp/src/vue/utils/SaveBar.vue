<template>
  <Transition>
    <div v-if="barActive" class="save-bar">
      <p>{{ t("config.savebar.content") }}</p>
      <div class="action-bar">
        <p class="cancel" @click="emits('cancel')">
          {{ t("config.savebar.cancel") }}
        </p>
        <button @click="emits('save')">{{ t("config.savebar.save") }}</button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps({
  barActive: {
    type: Boolean,
    required: true,
  },
});

const emits = defineEmits(["save", "cancel"]);
</script>

<style scoped lang="scss">
.save-bar {
  display: flex;
  width: 65%;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  height: 24px;
  background-color: var(--secondary-background);
  border-radius: 8px;
  position: fixed;
  bottom: 10px;
  left: 50%;
  transform: translate(-50%, 0);
  z-index: 99;

  p {
    white-space: nowrap;
  }

  .action-bar {
    display: flex;
    align-items: center;
    gap: 12px;

    p {
      cursor: pointer;
      color: var(--secondary-text);
    }

    button {
      all: unset;
      padding: 7px 22px;
      color: white;
      background: var(--primary);
      border-radius: 5px;
      cursor: pointer;
    }
  }
}

.v-enter-active,
.v-leave-active {
  transition: 0.2s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.v-enter-from {
  transform: translate(-50%, 40px);
}

.v-leave-to {
  transform: translate(-50%, 40px);
}
</style>
