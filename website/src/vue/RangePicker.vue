<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { RANGES, type RangeId } from "@/objects/ChartRange.ts";

// The window pills every daily chart shares: quiet by default, the active one carries the accent.
// Pure presentation - the owning card holds the selection and does its own slicing (ChartRange.ts),
// so the picker stays dumb and identical wherever it appears.

defineProps<{ modelValue: RangeId }>();
defineEmits<{ "update:modelValue": [value: RangeId] }>();

const { t } = useI18n();
</script>

<template>
  <div class="range-picker" role="group" :aria-label="t('chartRange.label')">
    <button
      v-for="range in RANGES"
      :key="range.id"
      type="button"
      class="range-pill"
      :class="{ active: modelValue === range.id }"
      :aria-pressed="modelValue === range.id"
      @click="$emit('update:modelValue', range.id)"
    >
      {{ t("chartRange." + range.id) }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.range-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;

  .range-pill {
    all: unset;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 999px;
    color: var(--secondary-text);
    border: 1px solid rgba(255, 255, 255, 0.12);

    &:hover {
      color: var(--primary-text);
      border-color: rgba(255, 255, 255, 0.25);
    }

    &:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }

    &.active {
      color: var(--primary);
      border-color: rgba(50, 212, 153, 0.5);
      background: rgba(50, 212, 153, 0.1);
    }
  }
}
</style>
