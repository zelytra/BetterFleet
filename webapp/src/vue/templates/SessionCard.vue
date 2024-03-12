<template>
  <div class="card" :style="{ background: background }">
    <img src="@/assets/banners/session.svg" />
    <div class="title-content">
      <h2>{{ title }}</h2>
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps({
  title: { type: String, required: true },
  background: {
    type: String,
    required: false,
    default: () => {
      return "linear-gradient(270deg, rgba(50, 212, 153, 0.20) 0%, rgba(50, 212, 153, 0.07) 108.45%)";
    },
  },
});
</script>

<style scoped lang="scss">
.card {
  width: 300px;
  height: auto;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 25px;
  box-sizing: border-box;
  cursor: pointer;
  transition: all 300ms cubic-bezier(0.39, 0.575, 0, 1.005); /* custom */

  &:hover {
    transform: translateY(-15px);
  }

  img {
    width: 100%;
  }

  .title-content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 19px;
    padding: 12px;

    h2 {
      font-size: 20px;
      font-family: Windlass, sans-serif;
    }

    :slotted(*) {
      font-size: 14px;
      font-family: Rubik, sans-serif;
      text-align: center;
      color: var(--secondary-text);
      margin-bottom: 30px;
    }
  }
}
</style>
