<template>
  <div class="input-global-wrapper">
    <label v-if="label">{{ label }}</label>
    <div :class="{ 'input-wrapper': true, disabled: lock }">
      <p>0</p>
      <input
        v-model.number="inputValue as number"
        class="range"
        type="range"
        :min="0"
        :max="100"
        :disabled="lock"
      />
      <p>100</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const inputValue = defineModel<number>("inputValue");
defineProps({
  label: { type: String, required: false },
  lock: { type: Boolean, required: false, default: () => false },
});
defineEmits(["validate"]);
</script>

<style scoped lang="scss">
.input-global-wrapper {
  display: flex;
  flex-direction: column;
  gap: 9px;

  .input-wrapper {
    position: relative;
    border-radius: 5px;
    display: flex;
    box-sizing: border-box;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-width: 250px;

    &.disabled {
      opacity: 0.8;
    }

    p {
      font-size: 14px;
    }

    input[type="range"].range {
      appearance: none;
      width: 100%;
      background: var(--primary);
      height: 4px;
      border-radius: 5px;

      &::-webkit-slider-thumb {
        appearance: none;
        width: 5px;
        height: 16px;
        border-radius: 5px;
        background: white;
        cursor: pointer;
      }
    }

    span.cross {
      cursor: pointer;

      &.disabled {
        cursor: not-allowed;
      }
    }
  }
}
</style>
