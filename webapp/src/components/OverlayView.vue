<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { UnlistenFn } from "@tauri-apps/api/event";
import { onOverlayUpdate, OverlaySnapshot } from "@/objects/fleet/Overlay.ts";

// The in-game overlay window's view (issue #671). Renders the compact snapshot the main window
// pushes: the player's own server and the session's biggest server. Movable by dragging (the whole
// card is a Tauri drag region).

const snapshot = ref<OverlaySnapshot | null>(null);
let unlisten: UnlistenFn | null = null;

// The overlay window is transparent; strip the app's opaque background so only the card shows.
let previousBackground = "";
onMounted(async () => {
  previousBackground = document.body.style.background;
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  unlisten = await onOverlayUpdate((s) => (snapshot.value = s));
});
onUnmounted(() => {
  if (unlisten) unlisten();
  document.body.style.background = previousBackground;
});

const statusLabel = computed(() => {
  const s = snapshot.value;
  if (!s) return "Waiting for BetterFleet…";
  if (!s.inSession) return "Not in a session";
  switch (s.status) {
    case "IN_GAME":
      return "";
    case "MAIN_MENU":
      return "In the main menu";
    case "STARTED":
      return "Game starting…";
    case "CLOSED":
      return "Game closed";
    default:
      return "Waiting…";
  }
});
</script>

<template>
  <div class="overlay" data-tauri-drag-region>
    <div class="header" data-tauri-drag-region>
      <span class="brand">🏴‍☠️ BetterFleet</span>
      <span class="grip">⠿</span>
    </div>

    <div v-if="statusLabel" class="empty">{{ statusLabel }}</div>

    <div v-else class="rows">
      <div class="row">
        <span class="tag">You</span>
        <template v-if="snapshot?.myServer">
          <span
            class="dot"
            :style="{ background: snapshot.myServer.color || '#8a8a8a' }"
          ></span>
          <span class="addr">{{ snapshot.myServer.address || "—" }}</span>
          <span class="count">{{ snapshot.myServer.players }}</span>
        </template>
        <span v-else class="addr muted">resolving…</span>
      </div>

      <div v-if="snapshot?.biggestServer" class="row">
        <span class="tag top">Top</span>
        <span
          class="dot"
          :style="{ background: snapshot.biggestServer.color || '#8a8a8a' }"
        ></span>
        <span class="addr">{{ snapshot.biggestServer.address || "—" }}</span>
        <span class="count">{{ snapshot.biggestServer.players }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(14, 18, 26, 0.82);
  color: #eef1f5;
  font-family: system-ui, sans-serif;
  font-size: 13px;
  user-select: none;
  cursor: grab;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow: hidden;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0.75;
  font-size: 11px;
  letter-spacing: 0.04em;
}
.grip {
  opacity: 0.5;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.row {
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}
.tag {
  flex: 0 0 30px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  opacity: 0.6;
}
.tag.top {
  color: #f4c95d;
  opacity: 0.9;
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex: 0 0 auto;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.4);
}
.addr {
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1 1 auto;
}
.muted {
  opacity: 0.55;
  font-style: italic;
}
.count {
  flex: 0 0 auto;
  opacity: 0.85;
  font-variant-numeric: tabular-nums;
}
.count::after {
  content: " 👤";
  font-size: 10px;
}
.empty {
  opacity: 0.7;
  font-style: italic;
  padding: 2px 0;
}
</style>
