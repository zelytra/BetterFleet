<template>
  <div
    class="box"
    :class="{
      valid: props.alert.type.key === AlertType.VALID.key,
      error: props.alert.type.key === AlertType.ERROR.key,
      warning: props.alert.type.key === AlertType.WARNING.key,
    }"
  >
    <img :src="props.alert.type.value" alt="alert-icon" />
    <div class="alert-content">
      <p class="title">{{ props.alert.title }}</p>
      <p class="description">{{ props.alert.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";
import { Alert, AlertType } from "./Alert";

const props = defineProps({
  alert: {
    type: Object as PropType<Alert>,
    required: true,
  },
});
</script>

<style scoped lang="scss">
.box {
  width: 315px;
  //height: 60px;
  border-radius: 5px;
  padding: 9px 18px;
  margin-bottom: 8px;
  box-shadow: 0 4px 4px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  gap: 14px;

  &.valid {
    background-color: #1d8c64;
  }

  &.error {
    background-color: #8c1d1d;
  }

  &.warning {
    background-color: #d49332;
  }

  .alert-content {
    display: flex;
    flex-direction: column;
    align-items: start;

    img {
      width: 22px;
      height: 22px;
      margin-right: 13px;
    }

    p.title {
      padding: 0;
      margin: 0;
      font-size: 18px;
      font-family: Windlass, sans-serif;
    }
  }

  .description {
    font-family: Windlass, sans-serif;
    color: rgba(255, 255, 255, 0.7);
  }
}
</style>
