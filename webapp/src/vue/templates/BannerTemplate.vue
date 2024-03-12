<template>
  <div class="header-wrapper">
    <div class="header">
      <slot name="content" />
    </div>
    <slot name="left-content" />
  </div>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.header-wrapper {
  overflow: hidden;
  border-radius: 5px;
  height: 120px;
  width: 100%;
  display: flex;
  justify-content: center;
  .header {
    background: var(--secondary-background) url("@/assets/banners/lobby.png");
    background-size: cover;
    overflow: hidden;
    height: 100%;
    width: 100%;
  }
}
</style>
