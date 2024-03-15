<template>
  <section>
    <h1>{{ t('home.title') }} <span>{{ t('appName') }}</span></h1>
    <div class="radial-background"/>
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
  height: 100%;
  width: 100%;
  position: relative;

  h1 {
    font-size: 60px;
    text-align: center;

    span {
      color: var(--primary);
    }
  }

  .radial-background {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    border-radius: 100%;
    opacity: 0.2;
    width: 50%;
    height: 50%;
    background: radial-gradient(56.39% 55.75% at 50% 50%, rgba(255, 255, 255, 0.70) 0%, rgba(88, 149, 127, 0.70) 73%, rgba(26, 110, 79, 0.70) 100%, rgba(26, 110, 79, 0.70) 100%);
    filter: blur(127.80000305175781px);
  }
}
</style>