<template>
  <header>
    <img src="@/assets/icons/logo.svg"/>
    <nav>
      <router-link
          v-for="route in routes"
          :key="route.name"
          class="router-link"
          :to="route.path"
      >
        {{ route.name }}
      </router-link>
    </nav>
    <a v-if="AppStore.githubRelease.url" :href="AppStore.githubRelease.url">
      <PirateButton :label="t('button.download')"/>
    </a>
  </header>
</template>

<script setup lang="ts">
import {routes} from "@/router";
import PirateButton from "@/vue/PirateButton.vue";
import {useI18n} from "vue-i18n";
import {AppStore} from "@/objects/stores/appStore.ts";

const {t} = useI18n()
</script>

<style scoped lang="scss">
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 0 24px 12px;
  height: 90px;
  background: url("@/assets/backgrounds/header.svg") repeat-x 50% 100%/1200px 144px;
  position: relative;

  img {
    height: 60px;
  }

  nav {
    position: absolute;
    top: 43%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 48px;

    .router-link-active {
      color: var(--primary);
    }
  }
}
</style>