<template>
  <div
    :class="{ 'server-wrapper': true }"
    :style="{ borderColor: color, backgroundColor: getBackgroundColor() }"
  >
    <h2 class="server-title" :style="{ backgroundColor: barColor }">
      {{ server }}
    </h2>
    <div class="player-wrapper">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { serverBarColor } from "@/objects/fleet/ServerColor.ts";

const props = defineProps({
  server: String,
  color: { type: String, required: true },
  playerCount: { type: Number, required: true },
});

// The bar is the server's colour pulled toward the background: the palette is saturated enough that
// white on the raw colour is unreadable for most of it. See ServerColor.ts.
const barColor = computed(() => serverBarColor(props.color));

function getBackgroundColor(): string {
  if (props.playerCount >= 5) {
    return props.color + "1A";
  }
  return "";
}
</script>

<style scoped lang="scss">
.server-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid;
  border-radius: 5px;
  // The bar is flush to the border on three sides; without this its square corners poke out through
  // the wrapper's rounded ones.
  overflow: hidden;

  .server-title {
    font-size: 16px;
    text-align: center;
    color: var(--primary-text);
    margin: 0;
    padding: 7px 8px;
  }

  .player-wrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 8px 8px;
  }
}
</style>
