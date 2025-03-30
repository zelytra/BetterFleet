<template>
  <div class="input-global-wrapper">
    <label v-if="label">{{ label }}</label>
    <div :class="{ 'input-wrapper': true, disabled: lock }">
      <input
        v-model="inputValue"
        type="text"
        :disabled="lock"
        :placeholder="placeholder"
        @keydown.enter="emits('validate')"
      />
      <span :class="{ cross: true, disabled: lock }" @click="resetInput">
        <img src="@/assets/icons/cross.svg" />
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
const inputValue = defineModel<string>("inputValue", { default: () => "" });
const props = defineProps({
  placeholder: { type: String, required: false, default: "" },
  label: { type: String, required: false },
  lock: { type: Boolean, required: false, default: () => false },
});
const emits = defineEmits(["validate"]);

function resetInput() {
  if (!props.lock) {
    inputValue.value = "";
  }
}
</script>

<style scoped lang="scss">
.input-global-wrapper {
  display: flex;
  flex-direction: column;
  gap: 9px;

  .input-wrapper {
    position: relative;
    padding: 5px 10px;
    border-radius: 5px;
    border: 1px solid var(--white-10, rgba(255, 255, 255, 0.1));
    background: var(--white-5, rgba(255, 255, 255, 0.05));
    display: flex;
    box-sizing: border-box;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    min-width: 300px;

    &.disabled {
      cursor: not-allowed;
      background: rgba(23, 26, 33, 0.4);
      color: var(--secondary-text);
    }

    input[type="text"] {
      all: unset;
      width: 100%;
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
