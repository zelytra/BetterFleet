<template>
  <transition>
    <section v-if="stats">
      <h1>{{ t("stats.title") }}</h1>
      <div class="stats-cards-wrapper">
        <div class="card">
          <h2>+ {{ stats.download }}</h2>
          <p>{{ t("stats.download") }}</p>
        </div>
        <div class="card important">
          <h2>+ {{ onlinePlayer }}</h2>
          <p>{{ t("stats.players") }}</p>
        </div>
        <div class="card">
          <h2>+ {{ stats.sessionsOpen }}</h2>
          <p>{{ t("stats.sessions") }}</p>
        </div>
      </div>
    </section>
  </transition>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { Stats } from "@/objects/Stats.ts";
import { HTTPAxios } from "@/objects/HTTPAxios.ts";
import { AxiosResponse } from "axios";
import { useI18n } from "vue-i18n";

const stats = ref<Stats>();
const onlinePlayer = ref<number>(0);
const { t } = useI18n();

onMounted(() => {
  new HTTPAxios("stats/all", null).get().then((response: AxiosResponse) => {
    stats.value = response.data as Stats;
  });
  new HTTPAxios("stats/online-users", null)
    .get()
    .then((response: AxiosResponse) => {
      onlinePlayer.value = response.data as number;
    });
});
</script>

<style scoped lang="scss">
section {
  height: 600px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 100px;

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
      background: url("@/assets/backgrounds/stats-underline.svg") no-repeat;
      width: 276px;
      height: 9px;
    }
  }

  .stats-cards-wrapper {
    display: flex;
    align-items: center;
    gap: 70px;

    .card {
      // Never wider than the viewport minus the page's breathing room — the parchment SVG scales.
      width: min(350px, calc(100vw - 40px));
      height: 190px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: url("@assets/backgrounds/stats-card.svg") 0 0/100% 100%
        no-repeat;

      &.important {
        background: url("@/assets/backgrounds/stats-card-important.svg") 0
          0/100% 100% no-repeat;
      }

      h2 {
        font-size: 42px;
        color: var(--primary);
      }

      p {
        font-size: 20px;
      }
    }
  }
}

// Three 350px cards and their gaps need ~1200px; below that they stack. The fixed 600px height
// goes with it, or three stacked cards overflow the section and overlap what follows.
@media (max-width: $lap) {
  section {
    height: auto;
    padding: 60px 20px;
    gap: 48px;

    .stats-cards-wrapper {
      flex-direction: column;
      gap: 24px;
    }
  }
}

// Phone (#670): three stacked 190px parchment cards were ~860px of scrolling for three numbers.
// They become one compact three-column band; the numbers stay the information, the title goes —
// a strip of counters explains itself.
@media (max-width: $palm) {
  section {
    padding: 28px 16px;
    gap: 0;

    h1 {
      display: none;
    }

    .stats-cards-wrapper {
      flex-direction: row;
      align-items: stretch;
      gap: 0;
      width: 100%;
      background: var(--secondary-background);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 16px 4px;
      box-sizing: border-box;

      .card {
        background: none;
        width: auto;
        flex: 1 1 0;
        height: auto;
        gap: 4px;
        padding: 2px 4px;

        & + .card {
          border-left: 1px solid rgba(255, 255, 255, 0.08);
        }

        h2 {
          font-size: 22px;
        }

        p {
          font-size: 12px;
          color: var(--secondary-text);
        }
      }
    }
  }
}
</style>
