<template>
  <transition>
    <div
      v-if="display && menu"
      v-click-outside="
        () => {
          display = false;
        }
      "
      :style="{ top: posTop - 5 + 'px', left: posLeft - 50 + 'px' }"
      class="context-menu"
      @mouseleave="display = false"
    >
      <p class="title">{{ menu.title }}</p>
      <button
        v-for="item in menu.data"
        :key="item.key"
        :class="item.class"
        @click="contextClick(item.key)"
      >
        {{ item.display }}
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { PropType, ref } from "vue";
import { ContextMenu } from "@/vue/context/ContextMenu.ts";

const posLeft = ref<number>(0);
const posTop = ref<number>(0);
const display = defineModel<boolean>("display");

defineProps({
  menu: { type: Object as PropType<ContextMenu<string>>, required: false },
});

const emits = defineEmits<{
  (e: "action", action: string): void;
}>();

defineExpose({ setPos });

function contextClick(item: string) {
  emits("action", item);
  display.value = false;
}

function setPos(event: any) {
  posLeft.value = event.clientX;
  posTop.value = event.clientY;
}
</script>

<style scoped lang="scss">
.context-menu {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  border-radius: 5px;
  position: absolute;
  z-index: 999;
  background: var(--primary-background);
  overflow: hidden;
  width: 210px;
  padding: 12px;
  gap: 8px;

  p.title {
    color: var(--primary);
  }

  button {
    box-sizing: border-box;
    all: unset;
    text-align: center;
    padding: 5px;
    border-radius: 5px;
    width: 100%;
    cursor: pointer;

    &.green {
      background: var(--green);

      &:hover {
        background: var(--green-hover);
      }
    }

    &.red {
      background: var(--red);

      &:hover {
        background: var(--red-hover);
      }
    }

    &.blue {
      background: var(--blue);

      &:hover {
        background: var(--blue-hover);
      }
    }
  }
}

.v-enter-active,
.v-leave-active {
  transition: 0.05s ease-in-out;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
