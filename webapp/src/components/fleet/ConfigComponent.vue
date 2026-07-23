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
          {{ t("config.disconnect") }}
        </button>
      </template>
    </BannerTemplate>
    <ParameterPart :title="t('config.part.general')">
      <!-- One column, two aligned blocks: a grid of equal-width fields, then a left-aligned list
           of toggles — instead of everything centre-wrapping freely. -->
      <div class="general-layout">
        <div class="fields">
          <SingleSelect
            v-model:data="langOptions"
            :label="t('config.lang.label')"
          />
          <SingleSelect
            v-model:data="deviceOptions"
            :label="t('config.device.label')"
          />
          <SingleSelect
            v-model:data="boatSizeOptions"
            :label="t('boatSize.label')"
          />
        </div>
        <div class="toggles">
          <div class="checkbox-wrapper descriptor">
            <input v-model="activeMacro" type="checkbox" />
            <div class="label-wrapper">
              <p @click="activeMacro = !activeMacro">
                {{ t("config.macro.check") }}
              </p>
              <p class="description" @click="activeMacro = !activeMacro">
                {{ t("config.macro.description") }}
              </p>
            </div>
          </div>
          <div class="checkbox-wrapper descriptor">
            <input v-model="shareStats" type="checkbox" />
            <div class="label-wrapper">
              <p @click="shareStats = !shareStats">
                {{ t("config.stats.check") }}
              </p>
              <p class="description" @click="shareStats = !shareStats">
                {{ t("config.stats.description") }}
              </p>
            </div>
          </div>
          <div class="checkbox-wrapper descriptor">
            <input v-model="presenceEnabled" type="checkbox" />
            <div class="label-wrapper">
              <p @click="presenceEnabled = !presenceEnabled">
                {{ t("config.presence.check") }}
              </p>
              <p
                class="description"
                @click="presenceEnabled = !presenceEnabled"
              >
                {{ t("config.presence.description") }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart :title="t('config.part.overlay')">
      <!-- One full-width column so the toggle and the hotkey field share a left edge, instead of
           ParameterPart centre-wrapping them onto differently-offset lines (same fix as #694). -->
      <div class="overlay-layout">
        <div class="checkbox-wrapper descriptor">
          <input v-model="overlayEnabled" type="checkbox" />
          <div class="label-wrapper">
            <p @click="overlayEnabled = !overlayEnabled">
              {{ t("config.overlay.toggle") }}
            </p>
            <p class="description" @click="overlayEnabled = !overlayEnabled">
              {{ t("config.overlay.description") }}
            </p>
          </div>
        </div>
        <!-- Styled after InputText (label above, same field box, cross to reset) so it reads as one
             of the app's inputs rather than a foreign button — review feedback on #692. -->
        <div class="hotkey-field">
          <div class="field-wrapper">
            <label>{{ t("config.overlay.hotkey.label") }}</label>
            <div
              :class="{ 'input-look': true, recording: recordingHotkey }"
              role="button"
              tabindex="0"
              @click="startHotkeyRecording()"
              @keydown.enter.prevent="startHotkeyRecording()"
            >
              <span class="value">
                {{
                  recordingHotkey
                    ? t("config.overlay.hotkey.recording")
                    : hotkeyLabel(UserStore.player.overlayHotkey)
                }}
              </span>
              <span
                v-if="UserStore.player.overlayHotkey && !recordingHotkey"
                class="cross"
                :title="t('config.overlay.hotkey.reset')"
                @click.stop="applyHotkey(undefined)"
              >
                <img src="@/assets/icons/cross.svg" />
              </span>
            </div>
          </div>
          <p class="description">{{ t("config.overlay.hotkey.hint") }}</p>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart :title="t('config.part.banner')">
      <div class="input-section banner-section">
        <p class="description">{{ t("config.banner.description") }}</p>
        <div class="banner-picker">
          <button
            v-for="index in bannerIndexes"
            :key="index"
            :class="{
              'banner-choice': true,
              selected: banner === index && !shuffleBanner,
              dimmed: shuffleBanner,
            }"
            type="button"
            :aria-pressed="banner === index && !shuffleBanner"
            :title="t('config.banner.pick', { number: index + 1 })"
            @click="pickBanner(index)"
          >
            <img :src="bannerUrl(index)" :alt="''" />
            <span v-if="banner === index && !shuffleBanner" class="check"
              >✓</span
            >
          </button>
        </div>
        <div class="checkbox-wrapper descriptor">
          <input v-model="shuffleBanner" type="checkbox" />
          <div class="label-wrapper">
            <p @click="shuffleBanner = !shuffleBanner">
              {{ t("config.banner.shuffle.check") }}
            </p>
            <p class="description" @click="shuffleBanner = !shuffleBanner">
              {{ t("config.banner.shuffle.description") }}
            </p>
          </div>
        </div>
      </div>
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
            <img src="../../assets/icons/sound.svg" alt="sound icon" />
            <p>{{ t("config.sound.test") }}</p>
          </button>
        </div>
        <div class="checkbox-wrapper">
          <input v-model="activeSound" type="checkbox" />
          <p @click="activeSound = !activeSound">
            {{ t("config.sound.check") }}
          </p>
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
        <div class="checkbox-wrapper">
          <input v-model="devMode" type="checkbox" />
          <p @click="devMode = !devMode">{{ t("config.devmode") }}</p>
        </div>
      </div>
    </ParameterPart>
    <ParameterPart :title="t('credits.title')">
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
        <p>
          {{ t("credits.sot.thanks") }}
          <a href="https://https://www.seaofthieves.com" target="_blank"
            >Sea of Thieves</a
          >
          {{ t("credits.sot.use") }}
        </p>
        <p class="light">
          {{ t("credits.details") }}
        </p>
      </div>
    </ParameterPart>
    <SaveBar
      :bar-active="isConfigDifferent()"
      @save="onSave()"
      @cancel="resetConfig"
    />
  </div>
</template>

<script setup lang="ts">
import BannerTemplate from "@/vue/templates/BannerTemplate.vue";
import { useI18n } from "vue-i18n";
import InputText from "@/vue/form/InputText.vue";
import SingleSelect from "@/vue/form/SingleSelect.vue";
import { SingleSelectInterface } from "@/vue/form/Inputs.ts";
import { inject, onMounted, onUnmounted, ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/tauri";

import fr from "@assets/icons/locales/fr.svg";
import de from "@assets/icons/locales/de.svg";
import es from "@assets/icons/locales/es.svg";
import en from "@assets/icons/locales/en.svg";
import it from "@assets/icons/locales/it.svg";
import xbox from "@assets/icons/xbox.svg";
import microsoft from "@assets/icons/microsoft.svg";
import playstation from "@assets/icons/playstation.svg";
import { UserStore } from "@/objects/stores/UserStore.ts";
import {
  DEFAULT_OVERLAY_HOTKEY,
  hotkeyLabel,
  isOverlayVisible,
  setOverlayVisible,
} from "@/objects/fleet/Overlay.ts";
import SaveBar from "@/vue/utils/SaveBar.vue";
import InputSlider from "@/vue/form/InputSlider.vue";
import countdownSound from "@assets/sounds/countdown.mp3";
import { BoatSize, PlayerDevice } from "@/objects/fleet/Player.ts";
import { boatIcon } from "@/objects/fleet/BoatIcons.ts";
import {
  BANNER_COUNT,
  bannerUrl,
  clampBanner,
} from "@/objects/fleet/Banners.ts";
import ParameterPart from "@/vue/templates/ParameterPart.vue";
import { Utils } from "@/objects/utils/Utils.ts";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { info } from "tauri-plugin-log-api";
import { AlertProvider, AlertType } from "@/vue/alert/Alert.ts";

const { t, availableLocales } = useI18n();
const alerts = inject<AlertProvider>("alertProvider");

const langOptions = ref<SingleSelectInterface>({ data: [] });
const deviceOptions = ref<SingleSelectInterface>({ data: [] });
const boatSizeOptions = ref<SingleSelectInterface>({ data: [] });
const devMode = ref<boolean>(false);
const volume = ref<number>(50);
const activeSound = ref<boolean>(true);
const activeMacro = ref<boolean>(true);
const banner = ref<number>(0);
const shuffleBanner = ref<boolean>(false);
const shareStats = ref<boolean>(true);
const presenceEnabled = ref<boolean>(true);
const bannerIndexes = Array.from({ length: BANNER_COUNT }, (_, i) => i);
const hostName = ref<string>(UserStore.player.serverHostName!);
const inputLoading = ref<boolean>(false);

// The overlay checkbox mirrors the overlay window's real visibility; toggling it shows or hides it.
const overlayEnabled = ref<boolean>(false);
watch(overlayEnabled, (visible) => setOverlayVisible(visible));

// Overlay hotkey recorder (#687). Press-to-set: the next modifier+key combo becomes the toggle,
// applied immediately through Rust — which keeps the previous combo bound if the new one is
// invalid or already taken. Escape cancels, reset returns to the default.
const recordingHotkey = ref(false);
const HOTKEY_ALIASES: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  " ": "Space",
};

function startHotkeyRecording(): void {
  if (recordingHotkey.value) return;
  recordingHotkey.value = true;
  window.addEventListener("keydown", captureHotkey, { capture: true });
}

function stopHotkeyRecording(): void {
  recordingHotkey.value = false;
  window.removeEventListener("keydown", captureHotkey, { capture: true });
}

function captureHotkey(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
  if (event.key === "Escape") {
    stopHotkeyRecording();
    return;
  }
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return; // modifiers held, still waiting for the actual key
  }
  const mods: string[] = [];
  if (event.ctrlKey || event.metaKey) mods.push("CommandOrControl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (!mods.length) {
    return; // a bare key as a global shortcut would fire while typing anywhere
  }
  const key =
    HOTKEY_ALIASES[event.key] ??
    (event.key.length === 1 ? event.key.toUpperCase() : event.key);
  stopHotkeyRecording();
  applyHotkey([...mods, key].join("+"));
}

function applyHotkey(accelerator: string | undefined): void {
  invoke("set_overlay_hotkey", {
    accelerator: accelerator ?? DEFAULT_OVERLAY_HOTKEY,
  })
    .then(() => {
      UserStore.player.overlayHotkey = accelerator;
    })
    .catch((e) =>
      alerts!.sendAlert({
        title: t("config.overlay.hotkey.invalid"),
        content: String(e),
        type: AlertType.ERROR,
      }),
    );
}

onUnmounted(() => stopHotkeyRecording());

const sound = new Audio(countdownSound);

onMounted(() => {
  loadOptionList();
  resetConfig();
  // Reflect whatever the overlay is currently doing (it may have been toggled by its hotkey).
  isOverlayVisible().then((visible) => (overlayEnabled.value = visible));
});

function loadOptionList() {
  langOptions.value.data = [];
  for (const locale of availableLocales) {
    langOptions.value.data.push({
      display: t("locales." + locale),
      id: locale,
      image: getImgUrl(locale),
    });
    langOptions.value.data = langOptions.value.data.filter(
      (x) => x.id !== "source",
    );
  }
  deviceOptions.value.data = [];
  deviceOptions.value.data.push({
    display: "Microsoft",
    id: PlayerDevice.MICROSOFT,
    image: getDeviceImgUrl("microsoft"),
  });
  deviceOptions.value.data.push({
    display: "Xbox",
    id: PlayerDevice.XBOX,
    image: getDeviceImgUrl("xbox"),
  });
  deviceOptions.value.data.push({
    display: "PlayStation",
    id: PlayerDevice.PLAYSTATION,
    image: getDeviceImgUrl("playstation"),
  });
  boatSizeOptions.value.data = [];
  for (const size of [
    BoatSize.NONE,
    BoatSize.SLOOP,
    BoatSize.BRIGANTINE,
    BoatSize.GALLEON,
  ]) {
    boatSizeOptions.value.data.push({
      display: t("boatSize." + size.toLowerCase()),
      id: size,
      image: boatIcon(size),
    });
  }
  resetConfig();
}

function resetConfig() {
  if (UserStore.player.device) {
    deviceOptions.value.selectedValue = deviceOptions.value.data.filter(
      (x) => x.id == UserStore.player.device,
    )[0];
  } else {
    deviceOptions.value.selectedValue = deviceOptions.value.data[0];
  }

  if (UserStore.player.boatSize) {
    boatSizeOptions.value.selectedValue = boatSizeOptions.value.data.filter(
      (x) => x.id == UserStore.player.boatSize,
    )[0];
  } else {
    boatSizeOptions.value.selectedValue = boatSizeOptions.value.data[0];
  }

  if (UserStore.player.lang) {
    langOptions.value.selectedValue = langOptions.value.data.filter(
      (x) => x.id == UserStore.player.lang,
    )[0];
  } else {
    langOptions.value.selectedValue = langOptions.value.data[0];
  }

  if (UserStore.player.serverHostName) {
    hostName.value = UserStore.player.serverHostName;
  }

  volume.value = UserStore.player.soundLevel;
  activeSound.value = UserStore.player.soundEnable;
  activeMacro.value = UserStore.player.macroEnable;
  banner.value = clampBanner(UserStore.player.banner);
  shuffleBanner.value = UserStore.player.bannerShuffle;
  shareStats.value = UserStore.player.shareStats;
  // Absent means enabled: only an explicit false turns the presence off (#684).
  presenceEnabled.value = UserStore.player.richPresence !== false;
  inputLoading.value = true;
}

/**
 * Picking a template turns shuffle off: choosing one and leaving "shuffle" on would show a checked
 * template that never gets used.
 */
function pickBanner(index: number) {
  banner.value = index;
  shuffleBanner.value = false;
}

function onSave() {
  UserStore.setLang(langOptions.value.selectedValue!.id);
  UserStore.player.device = deviceOptions.value.selectedValue!
    .id as PlayerDevice;
  UserStore.player.boatSize = boatSizeOptions.value.selectedValue!
    .id as BoatSize;
  UserStore.player.soundLevel = volume.value;
  UserStore.player.soundEnable = activeSound.value;
  UserStore.player.macroEnable = activeMacro.value;
  UserStore.player.banner = banner.value;
  UserStore.player.bannerShuffle = shuffleBanner.value;
  UserStore.player.shareStats = shareStats.value;
  UserStore.player.richPresence = presenceEnabled.value;
  UserStore.player.serverHostName = hostName.value;
  if (UserStore.player.fleet && UserStore.player.fleet.sessionId) {
    UserStore.player.fleet.updateToSession();
  }
  loadOptionList();
  info("[ConfigComponent.vue] User saved config");
}

function isConfigDifferent(): boolean {
  if (!inputLoading.value) return false;
  if (UserStore.player.serverHostName != hostName.value) return true;
  if (
    langOptions.value.selectedValue &&
    UserStore.player.lang != langOptions.value.selectedValue!.id
  )
    return true;
  if (volume.value != UserStore.player.soundLevel) return true;
  if (activeSound.value != UserStore.player.soundEnable) return true;
  if (activeMacro.value != UserStore.player.macroEnable) return true;
  if (banner.value != UserStore.player.banner) return true;
  if (shuffleBanner.value != UserStore.player.bannerShuffle) return true;
  if (shareStats.value != UserStore.player.shareStats) return true;
  if (presenceEnabled.value != (UserStore.player.richPresence !== false))
    return true;
  if (
    boatSizeOptions.value.selectedValue != undefined &&
    UserStore.player.boatSize != boatSizeOptions.value.selectedValue!.id
  )
    return true;
  return (
    deviceOptions.value.selectedValue != undefined &&
    UserStore.player.device != deviceOptions.value.selectedValue!.id
  );
}

function getImgUrl(iconName: string): string {
  switch (iconName) {
    case "fr":
      return fr;
    case "de":
      return de;
    case "es":
      return es;
    case "it":
      return it;
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
    sound.play();
  }
}
</script>

<style scoped lang="scss">
.user-info {
  height: 100%;
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
  background: linear-gradient(
    270deg,
    rgba(212, 50, 50, 0.2) 0%,
    rgba(212, 50, 50, 0) 108.45%
  );
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

  // General section: ParameterPart lays its children out as a centre-wrapping flex row,
  // which scattered mixed-width fields and toggles onto differently-centred lines. One full-width
  // column instead: a grid of equal-width fields, then a left-aligned list of toggles.
  .general-layout {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 32px;

    .fields {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px 24px;
      // Bottom-align the boxes so a label wrapping to two lines never pushes its input out of row.
      align-items: end;

      // InputText and SingleSelect share this root; stretch them to their cell instead of each
      // bringing its own intrinsic width.
      :deep(.input-global-wrapper) {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
    }

    .toggles {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
  }

  .input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;

    &.banner-section {
      gap: 16px;

      > p.description {
        color: var(--secondary-text);
        font-size: 14px;
      }
    }

    // Stacked full-width strips rather than a row of cards, because that is the shape these
    // actually are: 1294x57, 22.7:1. Squeezed into a 132x74 card, `cover` showed 7.9% of the
    // banner — a sliver of its middle. Three of them still read, since their sliver carries their
    // colour; the fourth is the panel's own colour and looked like an empty box. This previews the
    // whole banner, at the shape it is used in the sessions list.
    .banner-picker {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;

      .banner-choice {
        all: unset;
        position: relative;
        cursor: pointer;
        border-radius: 5px;
        overflow: hidden;
        width: 100%;
        aspect-ratio: 1294 / 57; // the artwork's own, so nothing is cropped
        border: 2px solid transparent;
        box-sizing: border-box;

        img {
          width: 100%;
          height: 100%;
          object-fit: cover; // a no-op at this aspect ratio; a guard if the artwork ever changes
          display: block;
        }

        &:hover {
          filter: brightness(1.1);
        }

        // The chosen one has to read at a glance from across the section, so it takes the border
        // and the others lose a little light.
        &:not(.selected) img {
          opacity: 0.55;
        }

        &.selected {
          border-color: var(--primary);
        }

        // Shuffle overrides the fixed pick, so nothing is "the" template while it is on — showing
        // one still checked would promise a banner that never arrives.
        &.dimmed img {
          opacity: 0.4;
        }

        .check {
          position: absolute;
          right: 6px;
          bottom: 4px;
          color: var(--primary);
          font-size: 18px;
          line-height: 1;
          text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
          pointer-events: none;
        }
      }
    }

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
  }

  .checkbox-wrapper {
    display: flex;
    align-items: center;
    gap: 12px;

    &.descriptor {
      align-items: start;
    }

    .label-wrapper {
      display: flex;
      flex-direction: column;
    }

    p.description {
      color: var(--secondary-text);
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
      clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
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
  justify-content: center;
  align-items: center;
  width: 100%;
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

// Overlay hotkey recorder (#687), dressed exactly like InputText (same wrapper metrics, same
// cross-to-reset) so it reads as one of the app's inputs — review feedback on #692. Top level:
// nested inside another section's selector it silently never applies, which is exactly how the
// first cut shipped browser-default buttons.
// Full-width column so the overlay toggle and the hotkey field share the section's left edge,
// instead of ParameterPart centre-wrapping each onto its own differently-offset line (same shape
// as the General section's .general-layout, added in #694).
.overlay-layout {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hotkey-field {
  display: flex;
  flex-direction: column;
  // Size to content and left-align: the field box hugs the combo it holds instead of stretching
  // to the full section, and the hint wraps under it rather than forcing a long line.
  align-items: flex-start;
  gap: 8px;

  .field-wrapper {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 9px;

    .input-look {
      position: relative;
      padding: 5px 10px;
      border-radius: 5px;
      border: 1px solid var(--white-10, rgba(255, 255, 255, 0.1));
      background: var(--white-5, rgba(255, 255, 255, 0.05));
      display: flex;
      box-sizing: border-box;
      align-items: center;
      gap: 12px;
      // The box takes only the width its text needs, like a label rather than a full input strip.
      width: fit-content;
      cursor: pointer;

      &.recording {
        border-color: var(--warning);

        .value {
          color: var(--warning);
        }
      }

      .value {
        font-variant-numeric: tabular-nums;
      }

      span.cross {
        cursor: pointer;
        display: flex;
      }
    }
  }

  p.description {
    // Wrap under the field box rather than stretching into a long single line.
    max-width: 340px;
    color: var(--secondary-text);
  }
}
</style>
