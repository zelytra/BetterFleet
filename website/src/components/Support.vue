<template>
  <section class="faq">
    <h1>{{ t("faq.title") }}</h1>
    <FaqCollapse id="download" :title="t('faq.question.download.title')">
      <p>{{ t('faq.question.download.content1') }} <a href="https://betterfleet.fr">BetterFleet</a></p>
      <ul>
        <li>{{ t('faq.question.download.content2') }}</li>
        <li>{{ t('faq.question.download.content3') }}</li>
      </ul>
      <p>{{ t('faq.question.download.content4') }}</p>
    </FaqCollapse>
    <FaqCollapse id="update" :title="t('faq.question.update.title')">
      <p>{{ t('faq.question.update.content1') }}</p>
    </FaqCollapse>
    <FaqCollapse id="EAC" :title="t('faq.question.eac.title')">
      <p>{{ t('faq.question.eac.content1') }}</p>
      <p>{{ t('faq.question.eac.content2') }}</p>
      <p>{{ t('faq.question.eac.content3') }}</p>
    </FaqCollapse>
    <FaqCollapse id="edge" :title="t('faq.question.edge.title')">
      <p>{{ t('faq.question.edge.content1') }}</p>
      <ul>
        <li>{{ t('faq.question.edge.content2') }}</li>
        <li>{{ t('faq.question.edge.content3') }}</li>
        <li>{{ t('faq.question.edge.content4') }}</li>
      </ul>
      <p>{{ t('faq.question.edge.content5') }}</p>
    </FaqCollapse>
    <FaqCollapse id="security" :title="t('faq.question.security.title')">
      <p>{{ t('faq.question.security.content1') }}</p>
      <ul>
        <li>{{ t('faq.question.security.content2') }}</li>
        <li>{{ t('faq.question.security.content3') }}</li>
        <li>{{ t('faq.question.security.content4') }}</li>
      </ul>
      <p>{{ t('faq.question.security.content5') }}</p>
    </FaqCollapse>
    <FaqCollapse id="bug" :title="t('faq.question.bug.title')">
      <p>{{ t('faq.question.bug.content1') }}</p>
      <ul>
        <li>{{ t('faq.question.bug.content2') }}</li>
        <li>{{ t('faq.question.bug.content3') }}</li>
      </ul>
      <p>{{ t('faq.question.bug.content4') }}</p>
    </FaqCollapse>
    <FaqCollapse id="data" :title="t('faq.question.data.title')">
      <p>{{ t('faq.question.data.content1') }}</p>
      <ul>
        <li>{{ t('faq.question.data.content2') }}</li>
        <li>{{ t('faq.question.data.content3') }}</li>
        <li>{{ t('faq.question.data.content4') }}</li>
        <li>{{ t('faq.question.data.content5') }}</li>
      </ul>
      <p>{{ t('faq.question.data.content6') }}</p>
    </FaqCollapse>
    <FaqCollapse id="console" :title="t('faq.question.console.title')">
      <p>{{ t('faq.question.console.content1') }}</p>
      <ul>
        <li>{{ t('faq.question.console.content2') }}</li>
        <li>{{ t('faq.question.console.content3') }}</li>
      </ul>
      <p>{{ t('faq.question.console.content4') }}</p>
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

  ul {
    margin-left: 24px;
  }

  a {
    color: var(--primary);

    &:hover {
      text-decoration: underline var(--primary);
    }
  }
}
</style>