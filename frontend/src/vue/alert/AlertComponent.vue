<template>
  <div class="alert-container">
    <transition-group>
      <AlertBox
        v-for="alert in alerts?.getAlerts"
        :key="alert.id"
        :alert="alert"
      />
    </transition-group>
  </div>
</template>

<script setup lang="ts">
import { inject } from "vue";
import { AlertProvider } from "./Alert";
import AlertBox from "./AlertBox.vue";

const alerts = inject<AlertProvider>("alertProvider");
</script>

<style scoped lang="scss">
.alert-container {
  position: fixed;
  right: 10px;
  top: 10px;
  z-index: 9999;
}

.v-move,
.v-enter-active,
.v-leave-active {
  transition: all 0.3s ease-in-out;
}

.v-leave-active {
  position: absolute;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
  transform: translateX(200px);
}
</style>
