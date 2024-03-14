<template>
  <section>
    <div class="description">
      <img src="@/assets/icons/key.svg"/>
      <p>{{ t('descriptions.key') }}</p>
    </div>
    <div class="description">
      <img src="@/assets/icons/hourglass.svg"/>
      <p>{{ t('descriptions.hourglass') }}</p>
    </div>
    <div class="description">
      <img src="@/assets/icons/globe.svg"/>
      <p>{{ t('descriptions.globe') }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";

const {t} = useI18n()
</script>

<style scoped lang="scss">
section {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 600px;
  gap: 200px;
  background: var(--secondary-background);

  .description {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 40px;
    max-width: 300px;

    p {
      text-align: center;
      color: var(--secondary-text);
      height: 140px;
      overflow: hidden;
    }
  }
}
</style>