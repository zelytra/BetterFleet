<template>
  <section>
    <h1>{{ t("comparison.title") }}</h1>
    <!-- Phone (#670): the chart is an image — shrunk to a phone its labels are unreadable. The
         same comparison as a native table costs no zoom; the chart stays for desktop. -->
    <div class="compare-table">
      <div class="c-row head">
        <div></div>
        <div class="mark bf">BF</div>
        <div class="mark">FC</div>
      </div>
      <div class="c-row">
        <div>{{ t("comparison.table.free") }}</div>
        <div class="mark yes">✓</div>
        <div class="mark no">✗</div>
      </div>
      <div class="c-row">
        <div>{{ t("comparison.table.detection") }}</div>
        <div class="mark yes">✓</div>
        <div class="mark no">✗</div>
      </div>
      <div class="c-row">
        <div>{{ t("comparison.table.public") }}</div>
        <div class="mark yes">✓</div>
        <div class="mark no">✗</div>
      </div>
      <div class="c-row">
        <div>{{ t("comparison.table.countdown") }}</div>
        <div class="mark yes">✓</div>
        <div class="mark yes">✓</div>
      </div>
      <div class="c-row">
        <div>{{ t("comparison.table.languages") }}</div>
        <div class="mark yes">✓</div>
        <div class="mark no">✗</div>
      </div>
    </div>
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

  .compare-table {
    display: none;
  }

  // Image beside text with 120px between them. Below $lap the pair is narrower than that gap, and
  // the text ends up at two or three words to the line.
  @media (max-width: $lap) {
    height: auto;
    padding: 64px 0;
    box-sizing: border-box;
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
    gap: 24px;
    padding: 40px 16px;

    h1 {
      font-size: 34px;
    }

    .compare-table {
      display: block;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 12px;
      overflow: hidden;
      font-size: 14px;
      background: var(--primary-background-static, #171a21);

      .c-row {
        display: grid;
        grid-template-columns: 1fr 56px 56px;
        align-items: center;

        > div {
          padding: 11px 12px;
        }

        & + .c-row {
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        &.head {
          font-size: 12px;
          color: var(--secondary-text);
          text-transform: uppercase;
          letter-spacing: 0.04em;

          .bf {
            color: var(--primary);
            font-weight: 700;
          }
        }

        .mark {
          text-align: center;
          font-weight: 700;

          &.yes {
            color: var(--primary);
          }

          &.no {
            color: var(--important, #d43232);
          }
        }
      }
    }

    // The chart image goes; the table above carries its data. The text stays.
    .content img {
      display: none;
    }
  }
}
</style>
