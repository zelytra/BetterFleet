<template>
  <section class="report">
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t('report.faq.title') }}</h2>
        <p>{{ t('report.faq.content') }}</p>
        <div>
          <PirateButton :label="t('report.faq.button.discord')"/>
          <PirateButton :label="t('report.faq.button.faq')"/>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart>
      <div class="report-wrapper">
        <h2>{{ t('report.bug.title') }}</h2>
        <p>{{ t('report.bug.content1') }}</p>
        <p>{{ t('report.bug.content2') }}</p>
        <div class="text-area-wrapper">
          <textarea maxlength="500" v-model="reportMessage"/>
          <p>{{ reportMessage.length }}/500</p>
        </div>
        <PirateButton :label="t('report.bug.button')"/>
      </div>
    </ParameterPart>
  </section>
</template>

<script setup lang="ts">

import ParameterPart from "@/vue/templates/ParameterPart.vue";
import {useI18n} from "vue-i18n";
import PirateButton from "@/vue/form/PirateButton.vue";
import {ref} from "vue";

const {t} = useI18n()
const reportMessage = ref("")
</script>

<style scoped lang="scss">
.report {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12px;
  height: 100%;

  .report-wrapper {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 40px;

    h2 {
      position: relative;

      &:after {
        display: flex;
        position: absolute;
        content: '';
        bottom: -10px;
        left: 50%;
        transform: translate(-50%, 0);
        background: url("@assets/backgrounds/underline.svg") no-repeat;
        width: 100px;
        height: 12px;
      }
    }

    p {
      text-align: center;
    }

    .text-area-wrapper {
      width: 100%;
      position: relative;

      textarea {
        width: 100%;
        height: 120px;
        box-sizing: border-box;
        border: 2px solid var(--primary);
        border-radius: 4px;
        background-color: var(--secondary-background);
        font-size: 16px;
        resize: none;
        padding: 6px;

        &:focus {
          outline: none;
        }
      }

      p {
        color: var(--primary);
        font-size: 12px;
        position: absolute;
        bottom: -15px;
        right: 0;
      }
    }
  }
}
</style>