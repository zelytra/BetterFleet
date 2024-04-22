<template>
  <section class="faq">
    <h1>{{ t("faq.title") }}</h1>
    <FaqCollapse id="download" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="update" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="EAC" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="edge" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="security" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="bug" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="data" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
    <FaqCollapse id="console" :title="t('faq.question.download.title')">
      <p>bonjour</p>
    </FaqCollapse>
  </section>
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";
import FaqCollapse from "@/vue/FaqCollapse.vue";

const {t} = useI18n();
</script>

<style scoped lang="scss">
section.faq {
  margin: 90px auto;
  min-height: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 80vw;
  gap: 15px;

  h1 {
    font-size: 60px;
  }
}
</style>