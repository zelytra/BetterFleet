<template>
  <button @click="emits('onButtonClick')">
    {{ label }}
  </button>
</template>

<script setup lang="ts">

defineProps({
  label: String
})

const emits = defineEmits(['onButtonClick'])
</script>

<style scoped lang="scss">
button {
  all: unset;
  background: url("@/assets/backgrounds/button.svg") 0 0/100% 100% no-repeat;;
  padding: 13px 60px;
  cursor: pointer;
}
</style>