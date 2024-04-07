<template>
  <div class="config-wrapper">
    <BannerTemplate>
      <template #content>
        <div class="user-info">
          <div class="username">
            <div
                v-if="UserStore.player.username"
                class="user-icon"
                :style="{ backgroundColor: Utils.generateRandomColor() }"
            >
              <p>
                {{ UserStore.player.username.charAt(0).toUpperCase() }}
              </p>
            </div>
            <p>{{ UserStore.player.username }}</p>
          </div>
        </div>
      </template>
      <template #left-content>
        <button @click="keycloakStore.keycloak.logout()">
          {{ t('config.disconnect') }}
        </button>
      </template>
    </BannerTemplate>
    <ParameterPart :title="t('config.part.general')">
      <SingleSelect
          :label="t('config.lang.label')"
          v-model:data="langOptions"
      />
      <SingleSelect
          :label="t('config.device.label')"
          v-model:data="deviceOptions"
      />
    </ParameterPart>
    <ParameterPart :title="t('config.part.audio')">
      <div class="input-section">
        <div class="sound-wrapper">
          <InputSlider
              v-model:input-value="volume"
              :label="t('config.sound.label')"
              :lock="!activeSound"
          />
          <button @click="runSound()">
            <img src="../../assets/icons/sound.svg" alt="sound icon"/>
            <p>{{ t("config.sound.test") }}</p>
          </button>
        </div>
        <div class="dev-mode-wrapper">
          <input type="checkbox" v-model="activeSound"/>
          <p @click="activeSound = !activeSound">{{ t("config.sound.check") }}</p>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart :title="t('config.part.developer')">
      <div class="input-section">
        <InputText
            v-model:input-value="hostName"
            :placeholder="t('config.server.placeholder')"
            :label="t('config.server.label')"
            :lock="!devMode"
        />
        <div class="dev-mode-wrapper">
          <input type="checkbox" v-model="devMode"/>
          <p @click="devMode = !devMode">{{ t("config.devmode") }}</p>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart title="Crédit">
      <div class="side-content credits">
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
          ><img src="../../assets/icons/discord.svg"
          /></a>
          <a href="https://github.com/zelytra/BetterFleet" target="_blank"
          ><img src="../../assets/icons/github.svg"
          /></a>
        </div>
        <p class="light">
          {{ t("credits.details") }}
        </p>
      </div>
    </ParameterPart>
    <SaveBar :bar-active="isConfigDifferent()" @save="onSave()" @cancel="resetConfig"/>
  </div>
</template>

<script setup lang="ts">
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import {useI18n} from "vue-i18n";
import InputText from "@/vue/form/InputText.vue";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import {SingleSelectInterface} from "@/vue/form/Inputs.ts";
import {inject, onMounted, ref,} from "vue";

import fr from "@assets/icons/locales/fr.svg";
import de from "@assets/icons/locales/de.svg";
import es from "@assets/icons/locales/es.svg";
import en from "@assets/icons/locales/en.svg";
import xbox from "@assets/icons/xbox.svg";
import microsoft from "@assets/icons/microsoft.svg";
import playstation from "@assets/icons/playstation.svg";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {AlertProvider, AlertType} from "@/vue/alert/Alert.ts";
import SaveBar from "@/vue/utils/SaveBar.vue";
import InputSlider from "@/vue/form/InputSlider.vue";
import countdownSound from "@assets/sounds/countdown.mp3";
import {PlayerDevice} from "@/objects/fleet/Player.ts";
import ParameterPart from "@/vue/templates/ParameterPart.vue";
import {Utils} from "@/objects/utils/Utils.ts";
import {keycloakStore} from "@/objects/stores/LoginStates.ts";

const {t, availableLocales} = useI18n();
const alerts = inject<AlertProvider>("alertProvider");

const langOptions = ref<SingleSelectInterface>({data: []});
const deviceOptions = ref<SingleSelectInterface>({data: []});
const devMode = ref<boolean>(false);
const volume = ref<number>(50);
const activeSound = ref<boolean>(true)
const hostName = ref<string>(UserStore.player.serverHostName!)
const username = ref<string>(UserStore.player.username);

const sound = new Audio(countdownSound);

onMounted(() => {
  loadOptionList();
  resetConfig();
});

function loadOptionList() {
  langOptions.value.data = []
  for (const locale of availableLocales) {
    langOptions.value.data.push({
      display: t("locales." + locale),
      id: locale,
      image: getImgUrl(locale),
    });
  }
  deviceOptions.value.data = []
  deviceOptions.value.data.push({
    display: "Microsoft",
    id: PlayerDevice.MICROSOFT,
    image: getDeviceImgUrl('microsoft')
  })
  deviceOptions.value.data.push({
    display: "Xbox",
    id: PlayerDevice.XBOX,
    image: getDeviceImgUrl('xbox')
  })
  deviceOptions.value.data.push({
    display: "PlayStation",
    id: PlayerDevice.PLAYSTATION,
    image: getDeviceImgUrl('playstation')
  })
  resetConfig();
}

function resetConfig() {
  if (UserStore.player.device) {
    deviceOptions.value.selectedValue = deviceOptions.value.data.filter((x) =>
        x.id == UserStore.player.device
    )[0]
  } else {
    deviceOptions.value.selectedValue = deviceOptions.value.data[0]
  }

  if (UserStore.player.lang) {
    langOptions.value.selectedValue = langOptions.value.data.filter(
        (x) => x.id == UserStore.player.lang,
    )[0];
  } else {
    langOptions.value.selectedValue = langOptions.value.data[0];
  }

  if (UserStore.player.username) {
    username.value = UserStore.player.username;
  }

  if (UserStore.player.serverHostName) {
    hostName.value = UserStore.player.serverHostName;
  }

  volume.value = UserStore.player.soundLevel;
  activeSound.value = UserStore.player.soundEnable;
}

function onSave() {
  UserStore.setLang(langOptions.value.selectedValue!.id);
  UserStore.player.device = deviceOptions.value.selectedValue!.id as PlayerDevice;
  UserStore.player.soundLevel = volume.value;
  UserStore.player.soundEnable = activeSound.value;
  if (username.value.length == 0 || username.value.length >= 16) {
    alerts!.sendAlert({
      content: t('alert.username.length.content'),
      title: t('alert.username.length.title'),
      type: AlertType.ERROR
    })
  } else {
    UserStore.player.username = username.value;
  }
  UserStore.player.serverHostName = hostName.value;
  if (UserStore.player.fleet && UserStore.player.fleet.sessionId) {
    UserStore.player.fleet.updateToSession()
  }
  loadOptionList();
}

function isConfigDifferent(): boolean {
  if (UserStore.player.username != username.value) return true;
  if (UserStore.player.serverHostName != hostName.value) return true;
  if (langOptions.value.selectedValue && UserStore.player.lang != langOptions.value.selectedValue!.id) return true;
  if (volume.value != UserStore.player.soundLevel) return true;
  if (activeSound.value != UserStore.player.soundEnable) return true;
  return deviceOptions.value.selectedValue != undefined && UserStore.player.device != deviceOptions.value.selectedValue!.id;
}

function getImgUrl(iconName: string): string {
  switch (iconName) {
    case "fr":
      return fr;
    case "de":
      return de;
    case "es":
      return es;
    default:
      return en;
  }
}

function getDeviceImgUrl(iconName: string): string {
  switch (iconName) {
    case "microsoft":
      return microsoft;
    case "xbox":
      return xbox;
    case "playstation":
      return playstation;
    default:
      return microsoft;
  }
}

function runSound() {
  if (sound.paused) {
    sound.volume = volume.value / 100;
    sound.play()
  }
}
</script>

<style scoped lang="scss">
.user-info {
  height: 100%;
  //width: 100%;
  box-sizing: border-box;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;

  .username {
    display: flex;
    align-items: center;
    gap: 42px;

    .user-icon {
      width: 70px;
      height: 70px;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 6px;

      p {
        user-select: none;
        text-align: center;
        margin-top: 4px;
        font-size: 48px;
        color: white;
      }
    }

    p {
      font-size: 25px;
    }
  }
}

button {
  all: unset;
  cursor: pointer;
  height: 100%;
  background: linear-gradient(270deg, rgba(212, 50, 50, 0.20) 0%, rgba(212, 50, 50, 0.00) 108.45%);
  padding: 0 16px;
  white-space: nowrap;
}

.config-wrapper {
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  position: relative;
  margin-bottom: 40px;

  .input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .sound-wrapper {
      display: flex;
      align-items: center;
      gap: 26px;

      button {
        all: unset;
        display: flex;
        align-self: end;
        align-items: center;
        height: auto;
        gap: 12px;
        border-radius: 5px;
        background: rgba(50, 212, 153, 0.05);
        padding: 4px 12px;
        cursor: pointer;
      }
    }

    .dev-mode-wrapper {
      display: flex;
      align-items: center;
      gap: 12px;
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

  .dev-mode-wrapper p {
    cursor: pointer;
  }
}

.credits {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  gap: 20px;

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
</style>
