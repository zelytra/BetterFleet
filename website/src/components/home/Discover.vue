<template>
  <section>
    <h1>{{ t("discover.title") }}</h1>
    <div class="slider-wrapper">
      <div class="slider-nav">
        <span @click="index = 0" :class="{ selected: index == 0 }">{{
          t("discover.discord.nav")
        }}</span>
        <span @click="index = 1" :class="{ selected: index == 1 }">{{
          t("discover.github.nav")
        }}</span>
        <span @click="index = 2" :class="{ selected: index == 2 }">{{
          t("discover.translation.nav")
        }}</span>
      </div>
      <div class="content-wrapper">
        <transition>
          <div class="content" v-if="index == 0">
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
          <div class="content" v-else-if="index == 1">
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
          <div class="content" v-else-if="index == 2">
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
