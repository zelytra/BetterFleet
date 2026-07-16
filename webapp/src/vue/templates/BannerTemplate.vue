<template>
  <div class="header-wrapper">
    <div
      class="header"
      :style="
        background ? { backgroundImage: `url(${background})` } : undefined
      "
    >
      <slot name="content" />
    </div>
    <slot name="left-content" />
  </div>
</template>

<script setup lang="ts">
defineProps({
  /**
   * Overrides the default artwork — the lobby passes its session's chosen banner (issue #602).
   * Optional, so every other page keeps the standard one without knowing this exists.
   */
  background: { type: String, required: false, default: "" },
});
</script>

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
    // The session banners are tall artwork in a 120px strip: without this they sit wherever the
    // top edge lands, which is sky on most of them.
    background-position: center;
    overflow: hidden;
    height: 100%;
    width: 100%;
  }
}
</style>
