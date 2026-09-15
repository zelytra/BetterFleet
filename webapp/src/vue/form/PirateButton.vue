<template>
  <button @click="emits('onButtonClick')">
    {{ label }}
  </button>
</template>

<script setup lang="ts">
defineProps({
  label: String,
});

const emits = defineEmits(["onButtonClick"]);
</script>

<style scoped lang="scss">
button {
  all: unset;
  background: url("@/assets/backgrounds/button.svg") no-repeat;
  background-size: 100% 100%;
  width: 234px;
  height: 74px;
  cursor: pointer;
  text-align: center;

  // A disabled button must LOOK disabled: the report form locks it while a send is in flight
  // (#883), and a full-strength button that ignores clicks reads as broken.
  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
}
</style>
