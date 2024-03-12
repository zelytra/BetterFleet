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
        <h2>{{ t("credits.title") }}</h2>
        <div class="content-wrapper">
          <div class="side-content">
            <InputText
              v-model:input-value="username"
              :placeholder="t('config.name.placeholder')"
              :label="t('config.name.label')"
            />
            <div class="dev-mode-wrapper">
              <input type="checkbox" v-model="devMode" />
              <p>{{ t("config.devmode") }}</p>
            </div>
            <InputText
              v-model:input-value="UserStore.player.serverHostName"
              :placeholder="t('config.server.placeholder')"
              :label="t('config.server.label')"
              :lock="!devMode"
            />
          </div>
          <div class="side-content">
            <SingleSelect
              :label="t('config.lang.label')"
              v-model:data="langOptions"
            />
          </div>
        </div>
      </div>
      <div class="side-content credits">
        <h2>{{ t("credits.title") }}</h2>
        <p>{{ t("credits.description") }}</p>
        <p>
          {{ t("credits.developed") }}
          <a href="https://zelytra.fr" target="_blank">Zelytra</a>
          {{ t("credits.and") }}
          <a href="https://github.com/dadodasyra" target="_blank">dadodasyra</a>
        </p>
        <p>
          {{ t("credits.designed") }}
          <a href="https://zetro.fr" target="_blank">Zetro</a>
        </p>
        <div class="social-wrapper">
          <p>{{ t("credits.socials") }}</p>
          <a href="https://discord.gg/sHPp5CPxf2" target="_blank"
            ><img src="@/assets/icons/discord.svg"
          /></a>
          <a href="https://github.com/zelytra/BetterFleet" target="_blank"
            ><img src="@/assets/icons/github.svg"
          /></a>
        </div>
        <p class="light">
          {{ t("credits.details") }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { useI18n } from "vue-i18n";
import InputText from "@/vue/form/InputText.vue";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import { SingleSelectInterface } from "@/vue/form/Inputs.ts";
import { onMounted, ref, watch } from "vue";

import fr from "@/assets/icons/locales/fr.svg";
import en from "@/assets/icons/locales/en.svg";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { onBeforeRouteLeave } from "vue-router";

const { t, availableLocales } = useI18n();
const langOptions = ref<SingleSelectInterface>({ data: [] });
const devMode = ref<boolean>(false);
const username = ref<string>(UserStore.player.username);

onMounted(() => {
  for (const locale of availableLocales) {
    langOptions.value.data.push({
      display: t("locales." + locale),
      id: locale,
      image: getImgUrl(locale),
    });
  }

  if (UserStore.player.lang) {
    langOptions.value.selectedValue = langOptions.value.data.filter(
      (x) => x.id == UserStore.player.lang,
    )[0];
  } else {
    langOptions.value.selectedValue = langOptions.value.data[0];
  }
});

watch(langOptions.value, () => {
  UserStore.setLang(langOptions.value.selectedValue!.id);
});

onBeforeRouteLeave((_to, _from, next) => {
  if (username.value.length == 0) {
    next(false);
  } else {
    UserStore.player.username = username.value;
    next();
  }
});

function getImgUrl(iconName: string): string {
  switch (iconName) {
    case "fr":
      return fr;
    default:
      return en;
  }
}
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
      //overflow: hidden;

      .dev-mode-wrapper {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      h2 {
        font-family: BrushTip, sans-serif;
        color: var(--primary);
        font-size: 25px;
        text-align: center;
      }

      &.inputs {
        overflow: visible;

        .content-wrapper {
          display: flex;
          gap: 12px;
          width: 100%;
          box-sizing: border-box;

          .side-content {
            box-sizing: border-box;
            width: 50%;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
        }

        input[type="checkbox"] {
          appearance: none;
          border: 1px solid var(--primary);
          border-radius: 4px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;

          &:before {
            content: "";
            width: 10px;
            transform: scale(0);
            height: 10px;
            background: var(--primary-text);
            clip-path: polygon(
              14% 44%,
              0 65%,
              50% 100%,
              100% 16%,
              80% 0%,
              43% 62%
            );
            transform-origin: bottom left;
          }

          &:checked {
            background: var(--primary);
            border: 2px solid var(--primary);

            &:before {
              transform: scale(1);
            }
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
