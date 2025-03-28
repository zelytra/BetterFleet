<template>
  <header>
    <img src="@/assets/icons/logo.svg" alt="app icon" />
    <nav>
      <router-link
        v-for="route in routes.filter((x) => x.meta.displayInNav)"
        :key="route.name"
        class="router-link"
        :to="route.path"
      >
        {{ route.name }}
      </router-link>
    </nav>
    <a
      v-if="AppStore.githubRelease.url"
      :href="AppStore.githubRelease.url"
      target="_blank"
    >
      <PirateButton
        :label="t('button.download')"
        @on-button-click="incrementDownload"
      />
    </a>
  </header>
  <div class="header-details">
    <img src="@/assets/icons/fire.svg" alt="fire icon" />
    <p>{{ t("header.details") }}</p>
  </div>
</template>

<script setup lang="ts">
import { routes } from "@/router";
import PirateButton from "@/vue/PirateButton.vue";
import { useI18n } from "vue-i18n";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";

const { t } = useI18n();
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
  background: url("@/assets/backgrounds/header.svg") repeat-x 50% 95%/1200px
    144px;
  position: relative;
  z-index: 4;
  margin-bottom: 35px;

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

.header-details {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: center;
  gap: 24px;
  top: 50px;
  z-index: 3;
  position: absolute;
  background: url("@/assets/backgrounds/header-details.svg") repeat-x 50%
    100%/1200px 144px;
  height: 120px;

  p {
    color: var(--warning);
  }
}
</style>
