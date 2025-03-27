<template>
  <router-view v-slot="{ Component }">
    <transition mode="out-in">
      <component :is="Component" />
    </transition>
  </router-view>
  <Loading :is-loading="false">
    <h1>{{ t("loading.targetGame") }}</h1>
  </Loading>
  <AlertComponent />
</template>

<script setup lang="ts">
import Loading from "@/vue/templates/Loading.vue";
import AlertComponent from "@/vue/alert/AlertComponent.vue";
import { useI18n } from "vue-i18n";
import { onMounted } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { PlayerDevice, PlayerStates } from "@/objects/fleet/Player.ts";

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
    macroEnable: true,
  });
});
</script>

<style scoped lang="scss"></style>
