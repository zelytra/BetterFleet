<template>
  <kinesis-container>
    <section>
      <div class="side-content text">
        <span class="pill">⚓ {{ t("presentation.pill") }}</span>
        <h1>{{ t("presentation.title") }}</h1>
        <p>{{ t("presentation.content") }}</p>
        <a
          v-if="AppStore.githubRelease.url"
          class="download-cta"
          :href="AppStore.githubRelease.url"
          target="_blank"
        >
          <PirateButton
            :label="t('button.downloadApp')"
            @on-button-click="incrementDownload"
          />
        </a>
        <!-- Phone (#670): actions a phone can actually take — understand the app, join the crew. -->
        <div class="mobile-cta">
          <router-link class="btn primary" to="/tutorial">
            {{ t("presentation.how") }}
          </router-link>
          <a
            class="btn ghost"
            href="https://discord.gg/sHPp5CPxf2"
            target="_blank"
          >
            {{ t("discover.discord.button") }}
          </a>
        </div>
      </div>
      <kinesis-element
        :strength="20"
        type="depth"
        class="side-content parallax"
      >
        <img
          class="parallax-image"
          src="@/assets/backgrounds/app-mockup.png"
          alt="app mockup"
        />
      </kinesis-element>
    </section>
  </kinesis-container>
</template>

<script setup lang="ts">
import { AppStore } from "@/objects/stores/appStore.ts";
import PirateButton from "@/vue/PirateButton.vue";
import { useI18n } from "vue-i18n";
import { incrementDownload } from "@/objects/Stats.ts";

const { t } = useI18n();
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

  // The pill and the phone CTAs only exist below $lap.
  .pill {
    display: none;
  }

  .mobile-cta {
    display: none;
  }

  // Below $lap the hero is the touch design (#670) — tablets included: pill, centred column,
  // actions a phone or tablet can take, and the app screenshot framed as decoration. The desktop
  // pair of 50% columns and its installer CTA never made sense this narrow.
  @media (max-width: $lap) {
    height: auto;
    min-height: 0;
    padding: 44px 24px 48px;
    flex-direction: column;
    justify-content: center;
    gap: 28px;

    .side-content {
      width: 100%;
      align-items: center;
      text-align: center;

      &.text {
        .pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          align-self: center;
          font-size: 12px;
          color: var(--warning, #ffbe5c);
          border: 1px solid rgba(255, 190, 92, 0.35);
          background: rgba(255, 190, 92, 0.08);
          padding: 5px 12px;
          border-radius: 999px;
        }

        h1 {
          font-size: 44px;
        }

        p {
          font-size: 16px;
          line-height: 1.6;
          max-width: 40ch;
        }

        // The desktop CTA downloads a Windows installer; pointless from a phone or tablet.
        .download-cta {
          display: none;
        }

        .mobile-cta {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 340px;
          align-self: center;

          .btn {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 50px;
            border-radius: 10px;
            box-sizing: border-box;
            font-size: 16px;
            font-weight: 600;
          }

          .btn.primary {
            background: var(--primary);
            color: #0b241b;
          }

          .btn.ghost {
            border: 1.5px solid rgba(255, 255, 255, 0.14);
            color: var(--primary-text);
          }
        }
      }

      // The app screenshot is decoration here, not information: framed like a window and faded out
      // before its unreadable-at-this-size details start to matter.
      &.parallax .parallax-image {
        width: 100%;
        max-width: 340px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 12px;
        mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
        -webkit-mask-image: linear-gradient(180deg, #000 55%, transparent 100%);
      }
    }
  }

  @media (max-width: $palm) {
    padding: 36px 16px 44px;

    .side-content.text h1 {
      font-size: 40px;
    }
  }
}
</style>
