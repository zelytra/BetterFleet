<template>
  <ModalTemplate v-model:is-modal-open.capitliaze="isConfirmationModalOpen">
    <div class="content-wrapper">
      <div class="content">
        <h2 :class="titleClass">{{ title }}</h2>
        <p>{{ content }}</p>
      </div>
      <div class="button-wrapper">
        <button :class="cancelClass" @click="isConfirmationModalOpen = false">
          {{ cancel }}
        </button>
        <button
          :class="confirmClass"
          @click="
            () => {
              emits('onConfirm');
              isConfirmationModalOpen = false;
            }
          "
        >
          {{ confirm }}
        </button>
      </div>
    </div>
  </ModalTemplate>
</template>

<script setup lang="ts">
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";

const isConfirmationModalOpen = defineModel<boolean>("isConfirmationModalOpen");

defineProps({
  title: String,
  titleClass: {
    type: String,
    required: false,
  },
  content: String,
  cancel: String,
  confirm: String,
  cancelClass: {
    type: String,
    required: false,
  },
  confirmClass: {
    type: String,
    required: false,
  },
});
const emits = defineEmits(["onConfirm"]);
</script>

<style scoped lang="scss">
.content-wrapper {
  width: 40vw;
  height: 25vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  background: #0f1013;

  .content {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 24px;
    padding: 0 24px;
    text-align: center;

    h2 {
      margin-top: 12px;
      &.warning {
        color: var(--warning);
      }

      &.important {
        color: var(--important);
      }

      &.information {
        color: var(--information);
      }
    }
  }

  .button-wrapper {
    display: flex;
    align-items: center;
    width: 100%;

    button {
      all: unset;
      cursor: pointer;
      width: 100%;
      text-align: center;
      padding: 10px;
      transition: all 100ms ease-in-out;

      &.warning {
        background-color: #d4933233;

        &:hover {
          background-color: var(--warning);
        }
      }

      &.important {
        background-color: #d4323233;

        &:hover {
          background-color: var(--important);
        }
      }

      &.information {
        background-color: #32d49933;

        &:hover {
          background-color: var(--information);
        }
      }
    }
  }
}
</style>
