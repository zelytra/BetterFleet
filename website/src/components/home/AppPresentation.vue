<template>
  <kinesis-container>
    <section>
      <div class="side-content text">
        <h1>{{t('presentation.title')}}</h1>
        <p>{{t('presentation.content')}}</p>
        <a v-if="AppStore.githubRelease.url" :href="AppStore.githubRelease.url">
          <PirateButton :label="t('button.downloadApp')"/>
        </a>
      </div>
      <kinesis-element :strength="20" type="depth" class="side-content parallax">
        <img class="parallax-image" src="@/assets/backgrounds/app-mockup.png" alt="app mockup"/>
      </kinesis-element>
    </section>
  </kinesis-container>
</template>

<script setup lang="ts">
import {AppStore} from "@/objects/stores/appStore.ts";
import PirateButton from "@/vue/PirateButton.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n()
</script>

<style scoped lang="scss">
section {

  height: 700px;
  padding: 64px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  background: no-repeat;
  position: relative;
  justify-content: space-between;

  &:before {
    content: ' ';
    display: block;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    opacity: 0.6;
    background-image: url("@assets/backgrounds/presentation.png");
    background-repeat: no-repeat;
    background-position: 50% 0;
    background-size: cover;
    z-index: 0;
  }

  .side-content {
    width: 50%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: start;
    z-index: 2;

    &.text {
      h1 {
        font-size: 45px;
        font-family: BrushTip, sans-serif;
        color: var(--primary);
      }

      p {
        font-size: 20px;
        color: var(--secondary-text);
      }
    }

    &.parallax {
      display: flex;
      justify-content: center;
      align-items: center;

      .parallax-image {
        width: 80%;
        max-width: 800px;
        border-radius: 5px;
      }
    }
  }
}
</style>