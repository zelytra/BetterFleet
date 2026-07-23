<template>
  <router-view v-slot="{ Component }">
    <transition mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
  <LoadingVue :is-loading="false">
    <h1>{{ t("loading.targetGame") }}</h1>
  </LoadingVue>
  <AlertComponent />
</template>

<script setup lang="ts">
import LoadingVue from "@/vue/templates/LoadingVue.vue";
import AlertComponent from "@/vue/alert/AlertComponent.vue";
import { useI18n } from "vue-i18n";
import { onMounted } from "vue";
import { invoke } from "@tauri-apps/api/tauri";
import { error } from "tauri-plugin-log-api";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { DEFAULT_OVERLAY_HOTKEY } from "@/objects/fleet/Overlay.ts";
import {
  BoatSize,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";

const { t } = useI18n();

onMounted(() => {
  UserStore.init({
    lang: "en",
    soundEnable: true,
    soundLevel: 30,
    isMaster: false,
    isReady: false,
    status: PlayerStates.CLOSED,
    username: "",
    device: PlayerDevice.MICROSOFT,
    boatSize: BoatSize.NONE,
    macroEnable: true,
    banner: 0,
    bannerShuffle: false,
    shareStats: true,
  });
  // Rebind the overlay toggle to the player's saved combo (#687) — Rust bound the default at boot.
  if (
    UserStore.player.overlayHotkey &&
    UserStore.player.overlayHotkey !== DEFAULT_OVERLAY_HOTKEY
  ) {
    invoke("set_overlay_hotkey", {
      accelerator: UserStore.player.overlayHotkey,
    }).catch((e) => error("[App] failed to bind saved overlay hotkey: " + e));
  }
});
</script>

<style scoped lang="scss"></style>
