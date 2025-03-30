<template>
  <transition-group>
    <div v-if="isModalOpen" class="blur-background" />
    <div
      v-if="isModalOpen"
      v-click-outside="
        () => {
          isModalOpen = false;
        }
      "
      class="modal"
      @keydown.esc="isModalOpen = false"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="11"
        height="11"
        viewBox="0 0 11 11"
        fill="none"
        @click="isModalOpen = false"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M10.3189 0.772971C10.6118 1.06586 10.6118 1.54074 10.3189 1.83363L6.60656 5.54594L10.3189 9.25825C10.6118 9.55115 10.6118 10.026 10.3189 10.3189C10.026 10.6118 9.5511 10.6118 9.25821 10.3189L5.5459 6.6066L1.83359 10.3189C1.54069 10.6118 1.06582 10.6118 0.772926 10.3189C0.480033 10.026 0.480033 9.55115 0.772926 9.25825L4.48524 5.54594L0.772929 1.83363C0.480035 1.54074 0.480035 1.06586 0.772929 0.77297C1.06582 0.480076 1.5407 0.480077 1.83359 0.77297L5.5459 4.48528L9.25821 0.772971C9.5511 0.480077 10.026 0.480077 10.3189 0.772971Z"
          fill="#D43232"
        />
      </svg>
      <slot />
    </div>
  </transition-group>
</template>

<script setup lang="ts">
const isModalOpen = defineModel<boolean>("isModalOpen");
</script>

<style scoped lang="scss">
.blur-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  z-index: 5;
  backdrop-filter: blur(1.75px);
}

.modal {
  z-index: 6;
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  justify-content: center;
  background: var(--secondary-background);
  border-radius: 5px;
  overflow: hidden;
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.25);

  svg {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 15px;
    height: 15px;
    z-index: 99;
    cursor: pointer;
  }
}

.v-enter-active,
.v-leave-active {
  transition: 0.1s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
