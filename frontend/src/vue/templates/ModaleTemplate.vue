<template>
  <div
      v-if="isModalOpen"
      class="modal"
  >
    <slot/>
  </div>
</template>

<script setup lang="ts">
defineProps({
  isModalOpen: Boolean
})

const emits = defineEmits<{
  (e: "update:isModalOpen", isModalOpen: boolean): void;
}>();
</script>

<style scoped lang="scss">
.modal {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  padding: 12px;
  display: flex;
  justify-content: center;
  background: rgba(255, 255, 255, 0.19);
  border-radius: 16px;
  box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(11.7px);
  -webkit-backdrop-filter: blur(11.7px);
  max-width: 90%;
  min-width: 40%;
  height: 80%;
}
</style>