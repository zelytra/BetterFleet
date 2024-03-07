<template>
  <div class="server-wrapper" :style="{borderColor:randomColor}">
    <h2 :style="{color:randomColor}">{{ server }}</h2>
    <div class="player-wrapper">
      <slot/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {Utils} from "@/objects/Utils.ts";
import {ref} from "vue";

defineProps({
  server: String
})
const randomColor = ref<string>(Utils.generateRandomColor());
</script>

<style scoped lang="scss">
.server-wrapper {
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 2px solid;
  border-radius: 5px;


  h2 {
    font-size: 16px;
    text-align: center;
  }

  .player-wrapper {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}
</style>