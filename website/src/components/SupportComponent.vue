<template>
  <section>
    <div class="banner">
      <h1>{{ t("faq.faq") }}</h1>
      <p>{{ t("faq.description") }}</p>
    </div>
    <SeparatorVue />
    <div class="faq">
      <h1>{{ t("faq.title") }}</h1>
      <FaqCollapse
        id="download"
        url="support"
        :title="t('faq.question.download.title')"
      >
        <p>
          {{ t("faq.question.download.content1") }}
          <a href="https://betterfleet.fr">BetterFleet</a>
        </p>
        <ul>
          <li>{{ t("faq.question.download.content2") }}</li>
          <li>{{ t("faq.question.download.content3") }}</li>
        </ul>
        <p>{{ t("faq.question.download.content4") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="update"
        url="support"
        :title="t('faq.question.update.title')"
      >
        <p>{{ t("faq.question.update.content1") }}</p>
        <p>{{ t("faq.question.update.content2") }}</p>
      </FaqCollapse>
      <FaqCollapse id="EAC" url="support" :title="t('faq.question.eac.title')">
        <p>{{ t("faq.question.eac.content1") }}</p>
        <p>{{ t("faq.question.eac.content2") }}</p>
        <p>{{ t("faq.question.eac.content3") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="edge"
        url="support"
        :title="t('faq.question.edge.title')"
      >
        <p>{{ t("faq.question.edge.content1") }}</p>
        <ul>
          <li>{{ t("faq.question.edge.content2") }}</li>
          <li>{{ t("faq.question.edge.content3") }}</li>
          <li>{{ t("faq.question.edge.content4") }}</li>
          <li>{{ t("faq.question.edge.content5") }}</li>
        </ul>
        <p>{{ t("faq.question.edge.content6") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="security"
        url="support"
        :title="t('faq.question.security.title')"
      >
        <p>{{ t("faq.question.security.content1") }}</p>
        <ul>
          <li>{{ t("faq.question.security.content2") }}</li>
          <li>{{ t("faq.question.security.content3") }}</li>
          <li>{{ t("faq.question.security.content4") }}</li>
          <li>{{ t("faq.question.security.content5") }}</li>
        </ul>
        <p>{{ t("faq.question.security.content6") }}</p>
      </FaqCollapse>
      <FaqCollapse id="bug" url="support" :title="t('faq.question.bug.title')">
        <p>{{ t("faq.question.bug.content1") }}</p>
        <ul>
          <li>{{ t("faq.question.bug.content2") }}</li>
          <li>{{ t("faq.question.bug.content3") }}</li>
        </ul>
        <p>{{ t("faq.question.bug.content4") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="data"
        url="support"
        :title="t('faq.question.data.title')"
      >
        <p>{{ t("faq.question.data.content1") }}</p>
        <ul>
          <li>{{ t("faq.question.data.content2") }}</li>
          <li>{{ t("faq.question.data.content3") }}</li>
          <li>{{ t("faq.question.data.content4") }}</li>
          <li>{{ t("faq.question.data.content5") }}</li>
        </ul>
        <p>{{ t("faq.question.data.content6") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="console"
        url="support"
        :title="t('faq.question.console.title')"
      >
        <p>{{ t("faq.question.console.content1") }}</p>
        <ul>
          <li>{{ t("faq.question.console.content2") }}</li>
          <li>{{ t("faq.question.console.content3") }}</li>
        </ul>
        <p>{{ t("faq.question.console.content4") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="alliance"
        url="support"
        :title="t('faq.question.alliance.title')"
      >
        <p>{{ t("faq.question.alliance.content1") }}</p>
        <p>{{ t("faq.question.alliance.content2") }}</p>
        <p>{{ t("faq.question.alliance.content3") }}</p>
        <p>{{ t("faq.question.alliance.content4") }}</p>
      </FaqCollapse>
      <FaqCollapse
        id="password"
        url="support"
        :title="t('faq.question.password.title')"
      >
        <p>{{ t("faq.question.password.content1") }}</p>
        <p>{{ t("faq.question.password.content2") }}</p>
      </FaqCollapse>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import FaqCollapse from "@/vue/FaqCollapse.vue";
import SeparatorVue from "@/vue/SeparatorVue.vue";

const { t } = useI18n();
</script>

<style scoped lang="scss">
section {
  .banner {
    height: 443px;
    padding: 64px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: no-repeat;
    position: relative;
    gap: 33px;
    z-index: 0;

    h1 {
      z-index: 2;
      font-size: 48px;
    }

    p {
      z-index: 2;
      max-width: 50%;
    }

    &:before {
      content: " ";
      display: block;
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 100%;
      opacity: 0.6;
      background-image: url("@assets/backgrounds/faq.png");
      background-repeat: no-repeat;
      background-position: 50% 0;
      background-size: cover;
      z-index: 0;
    }
  }

  .faq {
    margin: 90px auto;
    min-height: 500px;
    display: flex;
    flex-direction: column;
    align-items: center;
    max-width: 80vw;
    gap: 15px;

    h1 {
      font-size: 32px;
      color: var(--primary);
      margin-bottom: 40px;
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
}
</style>
