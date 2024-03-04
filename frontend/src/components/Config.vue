<template>
  <div class="config-wrapper">
    <BannerTemplate>
      <template #content>
        <p class="page-title">
          {{ t("config.title") }}
        </p>
      </template>
    </BannerTemplate>
    <div class="config-content">
      <div class="side-content inputs">
        <h2>{{ t('credits.title') }}</h2>
        <div class="content-wrapper">
          <div class="side-content">
            <InputText
              input-value=""
              placeholder="oskour"
              :label="'Pseudonyme'"
            />
            <InputText
              input-value=""
              placeholder="oskour"
              :label="'Pseudonyme'"
            />
          </div>
          <div class="side-content">
            <InputText
              input-value=""
              placeholder="oskour"
              :label="'Pseudonyme'"
            />
          </div>
        </div>
      </div>
      <div class="side-content credits">
        <h2>{{ t('credits.title') }}</h2>
        <p>{{ t('credits.description') }}</p>
        <p>
          {{ t('credits.developed') }} <a
            href="https://zelytra.fr"
            target="_blank"
          >Zelytra</a> {{ t('credits.and') }} <a
            href="https://github.com/dadodasyra"
            target="_blank"
          >dadodasyra</a>
        </p>
        <p>
          {{ t('credits.designed') }} <a
            href="https://zetro.fr"
            target="_blank"
          >Zetro</a>
        </p>
        <div class="social-wrapper">
          <p>{{ t('credits.socials') }}</p>
          <a href="https://discord.gg/sHPp5CPxf2"><img src="@/assets/icons/discord.svg"></a>
          <a href="https://github.com/zelytra/BetterFleet"><img src="@/assets/icons/github.svg"></a>
        </div>
        <p class="light">
          {{ t('credits.details') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import {useI18n} from "vue-i18n";
import InputText from "@/vue/form/InputText.vue";

const {t} = useI18n();
</script>

<style scoped lang="scss">
.config-wrapper {
  display: flex;
  flex-direction: column;
  gap: 14px;
  height: 100%;

  p.page-title {
    text-align: center;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    font-family: BrushTip, sans-serif;
    line-height: 48px;
    font-size: 45px;
    margin-top: 8px;
  }

  .config-content {
    display: flex;
    height: calc(100% - 170px); // Minus header height
    max-height: 400px;
    box-sizing: border-box;
    gap: 14px;

    .side-content {
      width: 100%;
      height: 100%;
      background: var(--secondary-background);
      gap: 20px;
      border-radius: 5px;
      padding: 16px 8px;
      overflow: hidden;

      h2 {
        font-family: BrushTip, sans-serif;
        color: var(--primary);
        font-size: 25px;
        text-align: center;
      }

      &.inputs {
        .content-wrapper{
          display: flex;
          gap: 12px;
          width: 100%;
          box-sizing: border-box;

          .side-content{
            box-sizing: border-box;
            width: 50%;
            display: flex;
            flex-direction: column;
            gap: 24px;

          }
        }
      }

      &.credits {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: center;
        max-width: 400px;

        p {
          font-size: 16px;
          text-align: center;

          a {
            color: var(--primary);
            cursor: pointer;

            &:hover {
              text-decoration: underline var(--primary);
            }
          }

          &.light {
            color: var(--secondary-text);
          }
        }

        .social-wrapper {
          display: flex;
          align-items: center;
          gap: 12px;
        }
      }
    }
  }
}
</style>
