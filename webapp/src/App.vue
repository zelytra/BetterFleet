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
import { onMounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { error } from "@tauri-apps/plugin-log";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import router from "@/router";
import { checkForUpdate } from "@/objects/Updater.ts";
import { DEFAULT_OVERLAY_HOTKEY } from "@/objects/fleet/Overlay.ts";
import {
  BoatSize,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";

const { t } = useI18n();

// A session that ends mid-play - Keycloak rejected the refresh, so the store signed itself out -
// used to leave the player exactly where they were: the router guard only runs on navigation, so
// someone sitting on the fleet screen stayed on a dead page until they happened to click something.
// Send them to the sign-in screen instead. HTTPAxios has already raised the "session expired"
// alert, so this only moves them somewhere they can act on it. Watched here rather than in the
// store because the router imports the store, and importing it back would be a cycle.
watch(
  () => keycloakStore.isAuthenticated,
  (signedIn, wasSignedIn) => {
    if (wasSignedIn && !signedIn && router.currentRoute.value.path !== "/") {
      void router.push("/");
    }
  },
);

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
  // Rebind the overlay toggle to the player's saved combo (#687): Rust bound the default at boot.
  if (
    UserStore.player.overlayHotkey &&
    UserStore.player.overlayHotkey !== DEFAULT_OVERLAY_HOTKEY
  ) {
    invoke("set_overlay_hotkey", {
      accelerator: UserStore.player.overlayHotkey,
    }).catch((e) => error("[App] failed to bind saved overlay hotkey: " + e));
  }
  // Restore the boot-time update check the Tauri v2 migration silently dropped (#735). Fire and
  // forget: it never blocks startup and surfaces the update button only if a newer release exists.
  checkForUpdate();
});
</script>

<style scoped lang="scss"></style>
