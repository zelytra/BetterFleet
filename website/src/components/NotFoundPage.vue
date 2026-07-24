<template>
  <section class="not-found">
    <img class="logo" :src="logo" alt="BetterFleet" />
    <p class="code">404</p>
    <h1>{{ t("notFound.title") }}</h1>
    <p class="text">{{ t("notFound.text") }}</p>
    <router-link class="btn primary" to="/">{{
      t("notFound.home")
    }}</router-link>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import logo from "@/assets/icons/logo.svg";

const { t } = useI18n();
</script>

<style scoped lang="scss">
.not-found {
  min-height: 70vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  gap: 8px;
  padding: 40px 18px;

  .logo {
    width: 64px;
    height: 64px;
    margin-bottom: 8px;
  }

  .code {
    color: var(--primary);
    font-size: 44px;
    font-weight: 800;
    margin: 0;
    line-height: 1;
  }

  h1 {
    margin: 4px 0 0;
    font-size: 26px;
  }

  .text {
    color: var(--secondary-text);
    margin: 0 0 12px;
  }

  .btn.primary {
    min-height: 50px;
    padding: 0 28px;
    display: inline-flex;
    align-items: center;
    border-radius: 12px;
    background: var(--primary);
    color: #05231a;
    font-size: 16px;
    font-weight: 700;
    text-decoration: none;
  }
}
</style>
