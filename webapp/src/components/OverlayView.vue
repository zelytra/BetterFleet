<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { UnlistenFn } from "@tauri-apps/api/event";
import {
  onOverlayUpdate,
  OverlaySnapshot,
  OVERLAY_HOTKEY_LABEL,
} from "@/objects/fleet/Overlay.ts";
import { serverBarColor } from "@/objects/fleet/ServerColor.ts";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

// The in-game overlay window's view (issue #671). It mirrors the live session the way the app does:
// each server grouping (hash + region flag) with the pirates on it and their ready state — trimmed to
// just what matters at a glance in-game. The main window pushes a compact snapshot (including the
// player's active language) over a Tauri event; this window only listens, translates and renders.
// Drag it around by its header (a Tauri drag region).

const { t, locale } = useI18n();

const snapshot = ref<OverlaySnapshot | null>(null);
let unlisten: UnlistenFn | null = null;

function flagFor(code: string): string | undefined {
  return code ? countryFlags.get(code) : undefined;
}

// The overlay window is transparent; strip the app's opaque background so only the card shows.
let previousBackground = "";
onMounted(async () => {
  previousBackground = document.body.style.background;
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
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

    <div
      v-if="!snapshot || !snapshot.inSession || snapshot.servers.length === 0"
      class="empty"
      data-tauri-drag-region
    >
      {{ t("overlay.empty") }}
    </div>

    <div v-else class="servers">
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

        <ul class="players">
          <li
            v-for="player in server.players"
            :key="player.username"
            :class="{ player: true, self: player.isSelf }"
          >
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
            <span :class="['status', player.isReady ? 'ready' : 'not-ready']">
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
                <circle
                  cx="8"
                  cy="8"
                  r="7"
                  fill="currentColor"
                  opacity="0.18"
                />
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
                <circle
                  cx="8"
                  cy="8"
                  r="5"
                  stroke="currentColor"
                  stroke-width="1.7"
                />
              </svg>
            </span>
          </li>
        </ul>
      </section>
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

.servers {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  flex: 1 1 auto;
  /* Thin, unobtrusive scrollbar when the session outgrows the window. */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.25) transparent;
}
.servers::-webkit-scrollbar {
  width: 6px;
}
.servers::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 3px;
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
  list-style: none;
  margin: 0;
  padding: 4px 6px 5px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
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
.player .user {
  width: 12px;
  height: 12px;
  opacity: 0.55;
  flex: 0 0 auto;
}
.player .name {
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
</style>
