<template>
  <div
    :class="{ 'server-wrapper': true }"
    :style="{ borderColor: color, backgroundColor: getBackgroundColor() }"
  >
    <h2 class="server-title" :style="{ backgroundColor: barColor }">
      {{ server
      }}<span
        v-if="address"
        class="info-bubble"
        :title="address"
        :aria-label="address"
      >
        <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle
            cx="8"
            cy="8"
            r="7"
            stroke="currentColor"
            stroke-width="1.3"
          />
          <rect
            x="7.2"
            y="7"
            width="1.6"
            height="5"
            rx="0.8"
            fill="currentColor"
          />
          <circle cx="8" cy="4.5" r="1" fill="currentColor" />
        </svg>
      </span>
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
  // The server's ip:port, shown on hover of the title (#662). Empty while detection is still
  // pending, in which case no tooltip is offered.
  address: { type: String, default: "" },
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
    color: var(--primary-text);
    margin: 0;
    padding: 7px 8px;
    // Lay the hash and the bubble out as a centred row: vertical-align on an inline bubble aligns to
    // the text's x-height, which sits low under the uppercase hash and made the "i" look bottom-
    // aligned. align-items: center lines them up by their box centres instead. Wraps for long names.
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 6px;
  }

  // A small info bubble beside the hash (#662): hovering it shows the server's ip:port. Faint so it
  // sits quietly in the title bar, brightens on hover for feedback. cursor: help is the "this is
  // informational, not clickable" cue.
  .info-bubble {
    display: inline-flex;
    align-items: center;
    cursor: help;
    color: rgba(255, 255, 255, 0.65);
    transition: color 0.15s ease;

    &:hover {
      color: var(--primary-text);
    }

    svg {
      width: 14px;
      height: 14px;
      display: block;
    }
  }

  .player-wrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 0 8px 8px;
  }
}
</style>
