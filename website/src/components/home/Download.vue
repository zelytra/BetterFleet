<template>
  <section>
    <h1>
      {{ t("download.now") }} <span>{{ t("name") }}</span>
    </h1>
    <a
      v-if="AppStore.githubRelease.url"
      :href="AppStore.githubRelease.url"
      target="_blank"
    >
      <PirateButton
        :label="t('button.downloadHere')"
        @on-button-click="incrementDownload"
      />
    </a>
  </section>
</template>

<script setup lang="ts">
import PirateButton from "@/vue/PirateButton.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped lang="scss">
section {
  height: 400px;
  padding: 64px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: no-repeat;
  position: relative;
  gap: 33px;
  z-index: 0;

  &:before {
    content: " ";
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    opacity: 0.6;
    background-image: url("@assets/backgrounds/presentation.png");
    background-repeat: no-repeat;
    background-position: 50% 0;
    background-size: cover;
    z-index: 0;
  }

  h1 {
    z-index: 2;
    font-size: 59px;

    span {
      font-size: 70px;
      font-family: BrushTip, sans-serif;
      color: var(--primary);
    }
  }

  a {
    z-index: 2;
  }
}
</style>
