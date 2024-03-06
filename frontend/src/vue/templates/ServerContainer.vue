<template>
  <div class="server-wrapper">
    <h2>{{ server }}</h2>
    <div class="player-wrapper">
      <slot/>
    </div>
  </div>
</template>

<script setup lang="ts">

defineProps({
  server: String
})
</script>

<style scoped lang="scss">

</style>