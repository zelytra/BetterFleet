<script setup lang="ts">
import { useI18n } from "vue-i18n";
import BoatLoader from "@/vue/BoatLoader.vue";

/**
 * Placeholder for the globe while its chunk downloads.
 *
 * It reserves the globe's own height rather than collapsing: the card's region list sits directly
 * underneath, and a box that grows when three.js lands would shove it down the page mid-read.
 */
const { t } = useI18n();
</script>

<template>
  <div class="globe-loading" aria-busy="true">
    <BoatLoader :label="t('loading.globe')" :size="130" />
  </div>
</template>

<style scoped lang="scss">
.globe-loading {
  // GlobeCard's own min-height, so nothing below it moves when the globe arrives.
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
