<template>
  <div class="header-wrapper">
    <div
      class="header"
      :style="
        background ? { backgroundImage: `url(${background})` } : undefined
      "
    >
      <!-- The veil that makes the text readable on whichever artwork is behind it: see
           BannerScrim.ts for why it is a scrim and not a different text colour. -->
      <div class="scrim" :style="{ backgroundImage: bannerScrim() }" />
      <div class="content">
        <slot name="content" />
      </div>
    </div>
    <slot name="left-content" />
  </div>
</template>

<script setup lang="ts">
import { bannerScrim } from "@/objects/fleet/BannerScrim.ts";

defineProps({
  /**
   * Overrides the default artwork: the lobby passes its session's chosen banner (issue #602).
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
    position: relative;
    background: var(--secondary-background) url("@/assets/banners/lobby.png");
    background-size: cover;
    // The session banners are tall artwork in a 120px strip: without this they sit wherever the
    // top edge lands, which is sky on most of them.
    background-position: center;
    overflow: hidden;
    height: 100%;
    width: 100%;

    .scrim {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    // Over the scrim rather than under it; it keeps the slot's own full-size box, so what the
    // pages lay out inside it is unchanged.
    .content {
      position: relative;
      height: 100%;
    }
  }
}
</style>
