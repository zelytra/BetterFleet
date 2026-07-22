<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { OverlayPlayer } from "@/objects/fleet/Overlay.ts";

// One player line in the in-game overlay (issue #671): username + a ready/not-ready badge. For the
// local player the badge is a button that toggles their ready state (the click is relayed to the main
// window, which owns the session socket); for everyone else it is a read-only badge.

const props = defineProps<{ player: OverlayPlayer; clickable: boolean }>();
const emit = defineEmits<{ (e: "toggle"): void }>();
const { t } = useI18n();

function onToggle(): void {
  if (props.clickable) emit("toggle");
}
</script>

<template>
  <div :class="{ player: true, self: player.isSelf }">
    <svg
      class="user"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="8" cy="5" r="3" />
      <path d="M2 14c0-3.3 2.7-5 6-5s6 1.7 6 5v1H2z" />
    </svg>
    <span class="name">{{ player.username }}</span>
    <component
      :is="clickable ? 'button' : 'span'"
      :type="clickable ? 'button' : undefined"
      :class="['status', player.isReady ? 'ready' : 'not-ready', { clickable }]"
      @click="onToggle"
    >
      <span class="label">{{
        player.isReady
          ? t("session.player.ready")
          : t("session.player.notReady")
      }}</span>
      <svg
        v-if="player.isReady"
        class="ico"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.18" />
        <path
          d="M4.6 8.4l2.1 2.1 4.7-4.8"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      <svg
        v-else
        class="ico"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.7" />
      </svg>
    </component>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
  border-radius: 4px;
}
.player.self {
  background: rgba(50, 212, 153, 0.14);
}
.user {
  width: 12px;
  height: 12px;
  opacity: 0.55;
  flex: 0 0 auto;
}
.name {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.status {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  font-size: 10px;
  font-weight: 600;
  /* reset for the <button> variant */
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font-family: inherit;
  line-height: 1;
}
.status .label {
  font-size: 10px;
}
.status .ico {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
}
.status.ready {
  color: var(--information, #32d499);
}
.status.not-ready {
  color: var(--important, #d43232);
}
/* The local player's badge is a real toggle: make it feel clickable. */
.status.clickable {
  cursor: pointer;
  padding: 1px 4px;
  border-radius: 4px;
  transition: background 0.12s ease;
}
.status.clickable:hover {
  background: rgba(255, 255, 255, 0.12);
}
</style>
