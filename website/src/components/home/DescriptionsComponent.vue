<template>
  <section>
    <div class="description">
      <img src="@/assets/icons/key.svg" />
      <p>{{ t("descriptions.key") }}</p>
    </div>
    <div class="description">
      <img src="@/assets/icons/hourglass.svg" />
      <p>{{ t("descriptions.hourglass") }}</p>
    </div>
    <div class="description">
      <img src="@/assets/icons/globe.svg" />
      <p>{{ t("descriptions.globe") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
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

  // Three columns with 200px between them — 400px of gap on a 375px screen, so the columns collapsed
  // to about 70px each, five or six characters to the line. Worse, `height: 140px; overflow: hidden`
  // on the paragraph lines the three up on desktop and then simply cut the rest of the text away.
  // The copy here was not hard to read, it was not on the page.
  @media (max-width: $lap) {
    flex-direction: column;
    height: auto;
    gap: 56px;
    padding: 64px 16px;
    box-sizing: border-box;

    .description {
      max-width: 420px;
      gap: 24px;

      p {
        // Stacked, there is nothing left to line up with, and the clip has no job but to lose text.
        height: auto;
        overflow: visible;
      }
    }
  }

  @media (max-width: $palm) {
    gap: 44px;
    padding: 48px 14px;
  }
}
</style>
