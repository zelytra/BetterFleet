<template>
  <div :class="{'server-wrapper':true}" :style="{borderColor:color,backgroundColor:getBackgroundColor()}">
    <h2 :style="{color:color}">{{ server }}</h2>
    <div class="player-wrapper">
      <slot/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {findClosestColor} from "@/objects/Color.ts";

const color = ref<string>();

const props = defineProps({
  server: String,
  hash: {type: String, required: true},
  playerCount: {type: Number, required: true}
})

onMounted(() => {
  color.value = findClosestColor(props.hash);
})

function getBackgroundColor(): string {
  if (props.playerCount >= 5) {
    return color.value + "1A"
  }
  return "";
}
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