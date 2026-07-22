<template>
  <section>
    <!-- Phone only (#670): stacked cards read as a list, a list wants a name. -->
    <h1 class="mobile-title">{{ t("descriptions.title") }}</h1>
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

  .mobile-title {
    display: none;
  }

  // Phone (#670): three huge centred blocks (741px) become icon-left cards — full copy kept, a
  // third of the height.
  @media (max-width: $palm) {
    gap: 10px;
    padding: 40px 16px;
    align-items: stretch;

    .mobile-title {
      display: block;
      font-family: BrushTip, sans-serif;
      font-size: 34px;
      font-weight: 400;
      text-align: center;
      margin-bottom: 14px;
    }

    .description {
      flex-direction: row;
      align-items: flex-start;
      gap: 14px;
      max-width: none;
      background: var(--primary-background-static, #171a21);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      padding: 14px;
      box-sizing: border-box;

      img {
        width: 36px;
        height: 36px;
        flex: 0 0 36px;
        margin-top: 2px;
      }

      p {
        text-align: left;
        font-size: 14px;
        line-height: 1.55;
      }
    }
  }
}
</style>
