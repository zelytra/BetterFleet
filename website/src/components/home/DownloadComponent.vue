<template>
  <section>
    <h1>
      {{ t("download.now") }} <span>{{ t("name") }}</span>
    </h1>
    <a
      v-if="AppStore.githubRelease.url"
      class="download-cta"
      :href="AppStore.githubRelease.url"
      target="_blank"
    >
      <PirateButton
        :label="t('button.downloadHere')"
        @on-button-click="incrementDownload"
      />
    </a>
    <!-- Phone (#670): a phone cannot run the installer, but hiding the section threw the intent
         away with it. Copying the link lets the visit finish on a PC later. -->
    <div v-if="AppStore.githubRelease.url" class="pc-card">
      <h2>⚓ {{ t("download.pc.title") }}</h2>
      <p>{{ t("download.pc.content") }}</p>
      <button type="button" @click="copyLink">
        {{ copied ? t("download.pc.copied") : t("download.pc.copy") }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import PirateButton from "@/vue/PirateButton.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";
import { useI18n } from "vue-i18n";
import { ref } from "vue";

const { t } = useI18n();

const copied = ref(false);
let copiedTimer: number | undefined;

async function copyLink() {
  try {
    await navigator.clipboard.writeText(AppStore.githubRelease.url);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => (copied.value = false), 2000);
  } catch {
    // Clipboard denied (http origin or permissions): fall back to opening the link.
    window.open(AppStore.githubRelease.url, "_blank");
  }
}
</script>

<style scoped lang="scss">
section {
  height: 400px;
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

  &:before {
    content: " ";
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

  h1 {
    z-index: 2;
    font-size: 59px;

    span {
      font-size: 70px;
      font-family: BrushTip, sans-serif;
      color: var(--primary);
    }
  }

  a {
    z-index: 2;
  }

  .pc-card {
    display: none;
  }
}

// Below $lap — phones and tablets (#670): the desktop pitch (giant headline + installer button)
// makes no sense on a device that cannot run the installer — it becomes one card that keeps the
// intent: take the link with you, install on PC tonight.
@media (max-width: $lap) {
  section {
    height: auto;
    padding: 40px 16px;

    h1,
    .download-cta {
      display: none;
    }

    .pc-card {
      display: block;
      z-index: 2;
      width: 100%;
      max-width: 420px;
      box-sizing: border-box;
      border: 1px solid rgba(50, 212, 153, 0.35);
      background: rgba(50, 212, 153, 0.12);
      border-radius: 14px;
      padding: 20px 16px;
      text-align: center;

      h2 {
        font-size: 17px;
        margin-bottom: 6px;
      }

      p {
        color: var(--secondary-text);
        font-size: 14px;
        line-height: 1.55;
        margin-bottom: 14px;
      }

      button {
        all: unset;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        min-height: 48px;
        border-radius: 10px;
        background: var(--primary);
        color: #0b241b;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
      }
    }
  }
}
</style>
