<template>
  <section class="tutorial">
    <div class="banner">
      <h1>{{ t("tutorial.title") }}</h1>
    </div>
    <SeparatorVue />
    <div class="tutorial-content">
      <div class="text-wrapper">
        <h1>{{ t("tutorial.whatIsIt.title") }}</h1>
        <p>{{ t("tutorial.whatIsIt.content") }}</p>
      </div>
      <div class="text-wrapper">
        <h1>{{ t("tutorial.howTo.title") }}</h1>
        <p>{{ t("tutorial.howTo.content") }}</p>
      </div>
    </div>
    <div v-for="x of stepAmount" :key="x">
      <SeparatorVue />
      <div class="tutorial-content">
        <div class="step">
          <p>{{ t("tutorial.stepWord") + " " + x }}</p>
        </div>
        <div class="text-wrapper">
          <h1>{{ t("tutorial.step." + x + ".title") }}</h1>
          <p>{{ t("tutorial.step." + x + ".content") }}</p>
        </div>
        <img v-if="x == 1" src="@/assets/steps/1.png" alt="step" />
        <img v-if="x == 2" src="@/assets/steps/2.png" alt="step" />
        <img v-if="x == 3" src="@/assets/steps/3.png" alt="step" />
        <img v-if="x == 4" src="@/assets/steps/4.png" alt="step" />
        <img v-if="x == 5" src="@/assets/steps/5.png" alt="step" />
        <img v-if="x == 6" src="@/assets/steps/6.png" alt="step" />
        <img v-if="x == 7" src="@/assets/steps/7.png" alt="step" />
      </div>
    </div>
    <SeparatorVue />
    <div class="banner end">
      <h1>{{ t("tutorial.end.title") }}</h1>
      <p>{{ t("tutorial.end.content") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SeparatorVue from "@/vue/SeparatorVue.vue";

const { t } = useI18n();
const stepAmount = 7;
</script>

<style scoped lang="scss">
.tutorial {
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
      text-align: center;
    }

    p {
      z-index: 2;
      max-width: 50%;
      text-align: center;
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
      background-image: url("@assets/backgrounds/tutorial.png");
      background-repeat: no-repeat;
      background-position: 50% 0;
      background-size: cover;
      z-index: 0;
    }

    &.end:before {
      background-image: url("@assets/backgrounds/faq.png");
    }
  }

  .tutorial-content {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 5%;
    gap: 92px;

    .text-wrapper {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 34px;
    }

    .step {
      position: relative;
      z-index: 0;
      height: 101px;
      width: 341px;
      display: flex;
      align-items: center;
      justify-content: center;

      p {
        z-index: 1;
        font-size: 30px;
        text-align: center;
      }

      &:before {
        content: " ";
        display: block;
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        background-image: url("@assets/backgrounds/step.svg");
        background-repeat: no-repeat;
        background-position: 50% 0;
        background-size: cover;
        z-index: 0;
      }
    }

    h1 {
      color: var(--primary);
    }

    p {
      text-align: center;
    }

    img {
      max-width: 80%;
      image-rendering: high-quality;
      border-radius: 8px;
    }
  }
}
</style>
