<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { UnlistenFn } from "@tauri-apps/api/event";
import {
  onOverlayUpdate,
  OverlaySnapshot,
  OVERLAY_HOTKEY_LABEL,
  requestToggleReady,
} from "@/objects/fleet/Overlay.ts";
import { serverBarColor } from "@/objects/fleet/ServerColor.ts";
import { countryFlags } from "@/objects/utils/LangIcons.ts";
import OverlayPlayerRow from "@/components/OverlayPlayerRow.vue";

// The in-game overlay window's view (issue #671). It mirrors the live session the way the app does:
// each server grouping (hash + region flag) with the pirates on it and their ready state, trimmed to
// usernames and readiness. The local player always gets a row — inside their server grouping when it
// is known, otherwise a standalone row on top — so they can see and toggle their ready state even
// before their server is detected. The main window pushes a compact snapshot (including the player's
// active language) over a Tauri event; this window only listens, translates and renders. Drag it by
// its header (a Tauri drag region).

const { t, locale } = useI18n();

const snapshot = ref<OverlaySnapshot | null>(null);
let unlisten: UnlistenFn | null = null;

function flagFor(code: string): string | undefined {
  return code ? countryFlags.get(code) : undefined;
}

// Whether the local player is already shown inside a server grouping. When not (no server detected
// yet, or between servers), we surface a standalone row so their ready state is always in reach.
const meInServer = computed(() =>
  (snapshot.value?.servers ?? []).some((s) => s.players.some((p) => p.isSelf)),
);

function onSelfReadyClick(): void {
  requestToggleReady();
}

// The overlay window is transparent; strip the app's opaque backgrounds — html/body AND #app, which
// carries the gradient — so only the rounded card shows and the window corners stay see-through.
let previousBackground = "";
onMounted(async () => {
  previousBackground = document.body.style.background;
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  const appEl = document.getElementById("app");
  if (appEl) appEl.style.background = "transparent";
  unlisten = await onOverlayUpdate((s) => {
    snapshot.value = s;
    // Render in the player's language: the main window ships its active locale in every snapshot.
    if (s.locale && s.locale !== locale.value) {
      locale.value = s.locale as typeof locale.value;
    }
  });
});
onUnmounted(() => {
  if (unlisten) unlisten();
  document.body.style.background = previousBackground;
});
</script>

<template>
  <div class="overlay">
    <header class="bar" data-tauri-drag-region>
      <img class="logo" src="@/assets/icons/logo.svg" alt="BetterFleet" />
      <span class="brand">BetterFleet</span>
      <span class="hotkey">{{ OVERLAY_HOTKEY_LABEL }}</span>
    </header>

    <div class="body">
      <!-- Only render the session while there actually is one; otherwise fall back to the wait
           message. In a session, the local player still gets a standalone row when no server
           grouping holds them yet, so they can set their ready state before their server is found. -->
      <template v-if="snapshot && snapshot.inSession">
        <OverlayPlayerRow
          v-if="!meInServer"
          class="solo"
          :player="snapshot.me"
          :clickable="true"
          @toggle="onSelfReadyClick"
        />

        <section
          v-for="(server, i) in snapshot.servers"
          :key="server.hash + i"
          class="server"
          :style="{ borderColor: server.color || '#8a8a8a' }"
        >
          <div
            class="server-head"
            :style="{ background: serverBarColor(server.color || '#8a8a8a') }"
          >
            <span class="hash">{{ server.hash || "—" }}</span>
            <img
              v-if="flagFor(server.countryCode)"
              class="flag"
              :src="flagFor(server.countryCode)"
              :alt="server.countryCode"
            />
          </div>

          <div class="players">
            <OverlayPlayerRow
              v-for="player in server.players"
              :key="player.username"
              :player="player"
              :clickable="player.isSelf"
              @toggle="onSelfReadyClick"
            />
          </div>
        </section>
      </template>

      <div v-else class="empty" data-tauri-drag-region>
        {{ t("overlay.empty") }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.overlay {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  padding: 7px 8px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(14, 18, 26, 0.85);
  color: #eef1f5;
  font-family: system-ui, sans-serif;
  font-size: 12px;
  user-select: none;
  display: flex;
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
}

/* Header doubles as the drag handle. */
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: grab;
  flex: 0 0 auto;
}
.bar .logo {
  height: 16px;
  width: auto;
  display: block;
}
.bar .brand {
  font-weight: 700;
  letter-spacing: 0.02em;
}
.bar .hotkey {
  margin-left: auto;
  font-size: 10px;
  opacity: 0.65;
  padding: 1px 6px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1 1 auto;
  /* Thin, unobtrusive scrollbar when the session outgrows the window. */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}
.body::-webkit-scrollbar {
  width: 6px;
}
.body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 3px;
}

.empty {
  flex: 1 1 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  opacity: 0.7;
  font-style: italic;
  cursor: grab;
}

.server {
  border: 1.5px solid;
  border-radius: 6px;
  overflow: hidden;
}
.server-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 3px 6px;
  font-weight: 700;
}
.server-head .hash {
  letter-spacing: 0.03em;
}
.server-head .flag {
  height: 12px;
  width: 16px;
  object-fit: cover;
  border-radius: 2px;
  display: block;
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.35);
}

.players {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 6px 5px;
}
</style>
