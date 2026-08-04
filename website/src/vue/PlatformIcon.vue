<script setup lang="ts">
defineProps<{
  platform: "windows" | "linux" | "macos";
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
    v-else-if="platform === 'linux'"
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
  <svg
    v-else
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M13.6 6.3c-1.15-.07-2.12.63-2.68.63-.56 0-1.44-.6-2.36-.58-1.22.02-2.34.7-2.97 1.8-1.27 2.2-.33 5.46.9 7.25.6.87 1.33 1.85 2.28 1.81.9-.04 1.25-.59 2.36-.59s1.42.59 2.38.57c.98-.02 1.61-.89 2.22-1.76.7-1 .98-1.98.99-2.02-.02-.01-1.9-.74-1.92-2.9-.02-1.8 1.47-2.67 1.54-2.71-.84-1.23-2.14-1.37-2.6-1.4z"
      fill="currentColor"
    />
    <path
      d="M11.75 5.3c.47-.57.79-1.35.7-2.14-.68.03-1.5.46-2 1.02-.43.5-.81 1.3-.71 2.07.74.06 1.5-.37 2.01-.95z"
      fill="currentColor"
    />
  </svg>
</template>

<style scoped lang="scss">
svg {
  width: 100%;
  height: 100%;
}
</style>
