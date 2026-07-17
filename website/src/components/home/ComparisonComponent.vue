<template>
  <section>
    <h1>{{ t("comparison.title") }}</h1>
    <div class="content">
      <img src="@/assets/backgrounds/chart.svg" alt="chart" />
      <div class="description">
        <h2>{{ t("comparison.subtitle") }}</h2>
        <p>{{ t("comparison.description") }}</p>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
</script>

<style scoped lang="scss">
section {
  height: 800px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 100px;
  background: var(--secondary-background);

  h1 {
    font-family: BrushTip, sans-serif;
    font-size: 60px;
    position: relative;
    text-align: center;

    &:after {
      display: flex;
      position: absolute;
      content: "";
      bottom: 24px;
      left: 50%;
      transform: translate(-50%, 0);
      background: url("@assets/backgrounds/comparison-underline.svg") no-repeat;
      width: 451px;
      height: 12px;
    }
  }

  .content {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 120px;
    padding: 0 30px;

    img {
      max-width: 600px;
    }

    .description {
      text-align: end;
      max-width: 1000px;

      h2 {
        color: var(--primary);
      }
    }
  }

  // Image beside text with 120px between them. Below $lap the pair is narrower than that gap, and
  // the text ends up at two or three words to the line.
  @media (max-width: $lap) {
    gap: 48px;

    h1 {
      font-size: 44px;

      &:after {
        // 451px of decorative underline, centred with translate(-50%), hangs 38px off each side of a
        // 375px screen. It is background art: scale it rather than let it overhang.
        width: min(451px, 88vw);
        background-size: contain;
      }
    }

    .content {
      flex-direction: column;
      gap: 32px;
      padding: 0 16px;

      img {
        max-width: 100%;
      }

      .description {
        // End-aligned reads as a mistake once the image is above the text rather than beside it.
        text-align: center;
      }
    }
  }

  @media (max-width: $palm) {
    gap: 32px;

    h1 {
      font-size: 34px;
    }
  }
}
</style>
