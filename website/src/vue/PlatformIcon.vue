<script setup lang="ts">
import type { Platform } from "@/objects/PlatformDetection.ts";

defineProps<{
  platform: Platform;
}>();
</script>

<template>
  <svg
    v-if="platform === 'windows'"
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="1" y="1" width="8" height="8" rx="1.2" fill="currentColor" />
    <rect x="11" y="1" width="8" height="8" rx="1.2" fill="currentColor" />
    <rect x="1" y="11" width="8" height="8" rx="1.2" fill="currentColor" />
    <rect x="11" y="11" width="8" height="8" rx="1.2" fill="currentColor" />
  </svg>
  <svg
    v-else
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      x="1"
      y="2.5"
      width="18"
      height="15"
      rx="2.5"
      stroke="currentColor"
      stroke-width="1.5"
    />
    <path
      d="M4.5 7.5 8 10l-3.5 2.5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M10.5 12.5h5"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
    />
  </svg>
</template>

<style scoped lang="scss">
svg {
  width: 100%;
  height: 100%;
}
</style>
