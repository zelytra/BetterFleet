<template>
  <div class="input-wrapper">
    <input
      v-model="computedInput"
      type="text"
      :placeholder="placeholder"
      @keydown.enter="emits('validate')"
    />
    <span class="cross" @click="resetInput">
      <img src="@/assets/icons/cross.svg" />
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps({
  inputValue: {
    type: String,
    required: true,
    default: "",
  },
  placeholder: { type: String, required: false, default: "" },
});
const emits = defineEmits(["update:input-value", "validate"]);

const computedInput = computed({
  get: (): String => props.inputValue,
  set: (value: String): void => {
    emits("update:input-value", value);
  },
});

function resetInput() {
  computedInput.value = "";
}
</script>

<style scoped lang="scss">
.input-wrapper {
  position: relative;
  padding: 5px 10px;
  border-radius: 5px;
  border: 1px solid var(--white-10, rgba(255, 255, 255, 0.1));
  background: var(--white-5, rgba(255, 255, 255, 0.05));
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  min-width: 250px;

  input[type="text"] {
    all: unset;
    width: 100%;
  }

  span.cross {
    cursor: pointer;
  }
}
</style>
