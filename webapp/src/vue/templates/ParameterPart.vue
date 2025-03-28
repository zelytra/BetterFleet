<template>
  <div class="param-wrapper">
    <h2 v-if="title">{{ title }}</h2>
    <div class="template-wrapper">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: String,
});
</script>

<style scoped lang="scss">
.param-wrapper {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  gap: 20px;

  h2 {
    position: relative;
    &:after {
      display: flex;
      position: absolute;
      content: "";
      bottom: -10px;
      left: 50%;
      transform: translate(-50%, 0);
      background: url("@assets/backgrounds/underline.svg") no-repeat;
      width: 100px;
      height: 12px;
    }
  }

  .template-wrapper {
    border: 2px solid #222631;
    background: rgba(34, 38, 49, 0.2);
    padding: 43px;
    display: flex;
    align-items: center;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border-radius: 5px;
    gap: 40px;
  }
}
</style>
