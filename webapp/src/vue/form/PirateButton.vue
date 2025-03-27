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
}
</style>
