<template>
  <div v-if="data.selectedValue" class="input-global-wrapper">
    <label v-if="label">{{ label }}</label>
    <div
      :class="{ 'input-wrapper': true, disabled: lock, deploy: isOpen }"
      @click="isOpen = true"
    >
      <img :src="data.selectedValue.image" alt="flag" />
      <p>{{ data.selectedValue.display }}</p>
    </div>
    <transition>
      <div
        v-if="isOpen"
        v-click-outside="() => (isOpen = false)"
        class="dropdown"
        @mouseleave="isOpen = false"
      >
        <span
          v-for="option in data.data.filter(
            (x) => x.id !== data.selectedValue?.id,
          )"
          :key="option.id"
          @click="updateData(option)"
        >
          <img :src="option.image" alt="flag" />
          {{ option.display }}
        </span>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType, ref } from "vue";
import { InputData, SingleSelectInterface } from "@/vue/form/Inputs.ts";

const isOpen = ref<boolean>(false);
const props = defineProps({
  data: { type: Object as PropType<SingleSelectInterface>, required: true },
  label: { type: String, required: false },
  lock: { type: Boolean, required: false, default: () => false },
});
const emits = defineEmits(["update:data", "validate"]);

const computedInput = computed({
  get: (): SingleSelectInterface => props.data,
  set: (value: SingleSelectInterface): void => {
    emits("update:data", value);
  },
});

function updateData(option: InputData) {
  computedInput.value.selectedValue = option;
  isOpen.value = false;
}
</script>

<style scoped lang="scss">
.input-global-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 9px;

  .input-wrapper {
    position: relative;
    padding: 5px 10px;
    border-radius: 5px;
    border: 1px solid var(--white-10, rgba(255, 255, 255, 0.1));
    background: var(--white-5, rgba(255, 255, 255, 0.05));
    display: flex;
    box-sizing: border-box;
    align-items: center;
    gap: 12px;
    min-width: 250px;

    &:after {
      content: ">";
      position: absolute;
      top: 50%;
      right: 10px;
      transform: translate(-50%, -50%) rotate(0deg);
      color: var(--primary);
      animation: all 200ms ease-in-out;
      font-size: 20px;
    }

    &.deploy {
      &:after {
        transform: translate(-50%, -50%) rotate(90deg);
      }
    }

    &.disabled {
      cursor: no-drop;
      background: rgba(23, 26, 33, 0.4);
    }

    select {
      all: unset;
      width: 100%;

      option {
        background: var(--primary-background);
        padding: 4px;
        width: 100%;

        &:hover {
          background: var(--secondary-background);
        }
      }
    }

    span.cross {
      cursor: pointer;
    }
  }

  .dropdown {
    z-index: 9;
    background: var(--secondary-background);
    border: 1px solid rgba(255, 255, 255, 0.1);
    position: absolute;
    top: 70px;
    display: flex;
    flex-direction: column;
    width: 100%;
    border-radius: 5px;
    overflow: hidden;

    span {
      padding: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;

      &:hover {
        background: var(--primary-background);
      }
    }
  }
}
</style>
