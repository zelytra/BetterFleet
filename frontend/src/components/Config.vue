<template>
  <div class="config-wrapper">
    <BannerTemplate>
      <template #content>
        <p class="page-title">
          {{ t("config.title") }}
        </p>
      </template>
    </BannerTemplate>
    <div class="config-content">
      <div class="side-content">
        <p>test</p>
      </div>
      <div class="side-content">
        <p>test</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped lang="scss">
.config-wrapper {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;

  p.page-title {
    text-align: center;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: BrushTip, sans-serif;
    line-height: 48px;
    font-size: 45px;
    margin-top: 8px;
  }

  .config-content {
    display: flex;
    height: calc(100% - 170px); // Minus header height
    box-sizing: border-box;
    gap: 14px;

    .side-content {
      width: 100%;
      height: 100%;
      background: var(--secondary-background);
      gap: 20px;
      border-radius: 5px;
      padding: 16px 8px;
    }
  }
}
</style>
