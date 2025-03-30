<template>
  <div class="input-wrapper">
    <div class="wrapper input" @click="openOption()">
      <div class="selected-values">
        <div v-if="checked.length > 0">
          <p v-for="value of checked" :key="value">
            {{ value }}
          </p>
        </div>
        <span v-else>{{ placeHolder }}</span>
      </div>
      <img
        src="@assets/icons/flame.svg"
        alt="arrow"
        :class="{ open: toggleOption }"
      />
    </div>

    <transition>
      <div
        v-if="toggleOption"
        v-click-outside="() => closeOption()"
        class="wrapper options"
        @mouseleave="closeOption()"
      >
        <div
          v-for="option of options"
          :key="option"
          class="option"
          :class="{ selected: checked.includes(option.toString()) }"
          @click="forceCheckUpdate(option.toString())"
        >
          <input
            :id="option + '-input'"
            v-model="checked"
            type="checkbox"
            :value="option"
          />
          <label>{{ option }}</label>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";
import { ref } from "vue";

const checked = ref<string[]>([]);
const toggleOption = ref<boolean>(false);
const emits = defineEmits(["selectChange"]);

defineProps({
  options: {
    type: Object as PropType<string[]>,
    required: true,
  },
  placeHolder: String,
});

function forceCheckUpdate(option: string) {
  if (checked.value.includes(option)) {
    checked.value.splice(checked.value.indexOf(option), 1);
  } else {
    checked.value.push(option);
  }
  emits("selectChange", checked.value);
}

function openOption() {
  toggleOption.value = true;
}

function closeOption() {
  toggleOption.value = false;
}
</script>

<style scoped lang="scss">
@import "@assets/style.scss";

.input-wrapper {
  position: relative;
  width: 240px;

  .wrapper {
    border: 1px solid var(--primary);
    border-radius: 8px;
    padding: 10px 19px;
    background: var(--primary-background);

    &.input {
      display: flex;
      align-content: center;
      justify-content: space-between;

      .selected-values {
        overflow: hidden;
        display: flex;
        align-items: center;
        gap: 4px;
        max-width: 90%;

        :not(:last-child):nth-child(n):after {
          content: ",";
        }

        p {
          white-space: nowrap;
        }

        span {
          opacity: 0.5;
        }
      }

      img {
        width: 12px;

        &.open {
          transform: rotate(180deg);
        }
      }
    }

    &.options {
      top: 46px;
      left: 0;
      right: 0;
      position: absolute;
      z-index: 99;
      width: auto;
      display: flex;
      flex-direction: column;
      gap: 6px;

      .option {
        padding: 10px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        filter: brightness(0.8);

        &:hover {
          filter: brightness(1);
        }

        input[type="checkbox"] {
          appearance: none;
          border: 2px solid #c9ced6;
          border-radius: 4px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;

          &:before {
            content: "";
            width: 10px;
            transform: scale(0);
            height: 10px;
            background: var(--revert-text);
            clip-path: polygon(
              14% 44%,
              0 65%,
              50% 100%,
              100% 16%,
              80% 0%,
              43% 62%
            );
            transform-origin: bottom left;
          }

          &:checked {
            background: var(--main);
            border: 2px solid var(--primary);

            &:before {
              transform: scale(1);
            }
          }
        }

        label {
          color: var(--primary-text);
        }

        &.selected {
          label {
            color: var(--primary);
          }
        }
      }
    }
  }
}

.v-leave-active,
.v-enter-active {
  transition: 0.2s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
