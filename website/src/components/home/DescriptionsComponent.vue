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

  .mobile-title {
    display: none;
  }

  // Below $lap — phones and tablets (#670): three huge centred desktop columns (whose 200px gaps
  // and clipped paragraphs never fit here) become titled icon-left cards — full copy kept, a
  // third of the height. Capped at 560px so tablets keep a readable line length.
  @media (max-width: $lap) {
    flex-direction: column;
    align-items: center;
    height: auto;
    gap: 10px;
    padding: 44px 16px;
    box-sizing: border-box;

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
      width: 100%;
      max-width: 560px;
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
        // The desktop 140px clip lined three columns up; stacked it would only lose text.
        height: auto;
        overflow: visible;
        text-align: left;
        font-size: 14px;
        line-height: 1.55;
      }
    }
  }
}
</style>
