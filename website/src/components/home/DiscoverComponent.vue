<template>
  <section>
    <h1>{{ t("discover.title") }}</h1>
    <!-- Phone (#670): the tabbed board hid two thirds of this content behind 35px tabs. Three
         stacked cards show everything at once; the desktop slider stays as it is. -->
    <div class="mobile-cards">
      <div class="d-card">
        <div class="head">
          <img src="@/assets/icons/discord.svg" alt="" />
          <h3>{{ t("discover.discord.title") }}</h3>
        </div>
        <p>{{ t("discover.discord.content") }}</p>
        <a href="https://discord.gg/sHPp5CPxf2" target="_blank">
          <PirateButton :label="t('discover.discord.button')" />
        </a>
      </div>
      <div class="d-card">
        <div class="head">
          <img src="@/assets/icons/github.svg" alt="" />
          <h3>{{ t("discover.github.title") }}</h3>
        </div>
        <p>{{ t("discover.github.content") }}</p>
        <a href="https://github.com/zelytra/BetterFleet" target="_blank">
          <PirateButton :label="t('discover.github.button')" />
        </a>
      </div>
      <div class="d-card">
        <div class="head">
          <img src="@/assets/icons/globe.svg" alt="" />
          <h3>{{ t("discover.translation.title") }}</h3>
        </div>
        <p>{{ t("discover.translation.content") }}</p>
        <a href="https://crowdin.com/project/betterfleet" target="_blank">
          <PirateButton :label="t('discover.translation.button')" />
        </a>
      </div>
    </div>
    <div class="slider-wrapper">
      <div class="slider-nav">
        <span :class="{ selected: index == 0 }" @click="index = 0">{{
          t("discover.discord.nav")
        }}</span>
        <span :class="{ selected: index == 1 }" @click="index = 1">{{
          t("discover.github.nav")
        }}</span>
        <span :class="{ selected: index == 2 }" @click="index = 2">{{
          t("discover.translation.nav")
        }}</span>
      </div>
      <div class="content-wrapper">
        <transition>
          <div v-if="index == 0" class="content">
            <div class="side-content">
              <h2>{{ t("discover.discord.title") }}</h2>
              <p>{{ t("discover.discord.content") }}</p>
              <a href="https://discord.gg/sHPp5CPxf2" target="_blank">
                <PirateButton :label="t('discover.discord.button')" />
              </a>
            </div>
            <div class="side-content image">
              <img width="200px" src="@/assets/icons/discord.svg" />
            </div>
          </div>
          <div v-else-if="index == 1" class="content">
            <div class="side-content">
              <h2>{{ t("discover.github.title") }}</h2>
              <p>{{ t("discover.github.content") }}</p>
              <a href="https://github.com/zelytra/BetterFleet" target="_blank">
                <PirateButton :label="t('discover.github.button')" />
              </a>
            </div>
            <div class="side-content image">
              <img src="@/assets/backgrounds/discord-x-app.svg" />
            </div>
          </div>
          <div v-else-if="index == 2" class="content">
            <div class="side-content">
              <h2>{{ t("discover.translation.title") }}</h2>
              <p>{{ t("discover.translation.content") }}</p>
              <a href="https://crowdin.com/project/betterfleet" target="_blank">
                <PirateButton :label="t('discover.translation.button')" />
              </a>
            </div>
            <div class="side-content image">
              <img src="@/assets/backgrounds/app-mockup.png" />
            </div>
          </div>
        </transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import PirateButton from "@/vue/PirateButton.vue";

const { t } = useI18n();
const index = ref<number>(0);
</script>

<style scoped lang="scss">
section {
  height: 1200px;
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
      background: url("@assets/backgrounds/comparison-underline.svg") no-repeat;
      width: 451px;
      height: 12px;
    }
  }

  .slider-wrapper {
    width: 100%;
    height: 100%;
    max-width: 1640px;
    max-height: 589px;
    background: url("@/assets/backgrounds/discover.svg") no-repeat;
    background-size: contain;
    position: relative;

    .slider-nav {
      display: flex;
      align-items: center;
      gap: 12px;
      position: absolute;
      top: -10px;
      left: 50%;
      transform: translate(-50%, 0);

      span {
        background: url("@/assets/backgrounds/button-off.svg") no-repeat;
        background-size: cover;
        padding: 10px 20px;
        white-space: nowrap;
        width: 250px;
        cursor: pointer;
        text-align: center;

        &:hover,
        &.selected {
          background: url("@/assets/backgrounds/button.svg") no-repeat;
          background-size: cover;
        }
      }
    }

    .content-wrapper {
      height: 100%;
      width: 100%;

      .content {
        display: flex;
        justify-content: space-around;
        align-items: center;
        padding: 92px;
        height: 100%;
        box-sizing: border-box;
        gap: 64px;

        .side-content {
          display: flex;
          flex-direction: column;
          align-items: start;
          gap: 24px;
          width: 100%;
          max-width: 50%;

          h2 {
            color: var(--primary);
          }

          &.image {
            align-items: center;
          }

          img {
            max-width: 100%;
          }
        }
      }
    }
  }

  @media (max-width: $lap) {
    // The desktop 1200px was sized for the board art; stacked content is shorter and the
    // difference was dead scroll.
    height: auto;
    padding: 56px 0;
    box-sizing: border-box;
    gap: 48px;

    h1 {
      font-size: 44px;

      &:after {
        width: min(451px, 88vw);
        background-size: contain;
      }
    }

    .slider-wrapper {
      // The board art is `contain`, so on a narrow screen it scales to the width and its height
      // collapses (135px at 375px wide) while the stacked content needs far more — the text would
      // run straight off the bottom of the board. Stretched, it frames whatever height the content
      // turns out to be.
      background-size: 100% 100%;
      max-height: none;
      height: auto;

      .slider-nav {
        // Three 250px tabs plus their gaps want 774px.
        position: static;
        transform: none;
        justify-content: center;
        flex-wrap: wrap;
        gap: 8px;
        padding: 0 8px;

        span {
          width: auto;
          flex: 1 1 auto;
          min-width: 0;
          max-width: 250px;
          padding: 8px 12px;
          font-size: 15px;
        }
      }

      .content-wrapper .content {
        flex-direction: column;
        // 92px a side is half a phone screen.
        padding: 32px 20px;
        gap: 28px;

        .side-content {
          max-width: 100%;
          align-items: center;
          text-align: center;

          &.image img {
            max-width: 60%;
          }
        }
      }
    }
  }

  .mobile-cards {
    display: none;
  }

  @media (max-width: $palm) {
    height: auto;
    gap: 24px;
    padding: 40px 16px;
    box-sizing: border-box;

    h1 {
      font-size: 34px;
    }

    // The board and its tabs go; the cards carry the same three destinations.
    .slider-wrapper {
      display: none;
    }

    .mobile-cards {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;

      .d-card {
        background: var(--secondary-background);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 10px;

        .head {
          display: flex;
          align-items: center;
          gap: 10px;

          img {
            width: 30px;
            height: 30px;
          }

          h3 {
            font-size: 16px;
            color: var(--primary);
          }
        }

        p {
          color: var(--secondary-text);
          font-size: 14px;
          line-height: 1.55;
        }

        a {
          align-self: center;
        }
      }
    }
  }
}

.v-enter-active,
.v-leave-active {
  transition: 0.3s ease;
  position: absolute;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}
</style>
