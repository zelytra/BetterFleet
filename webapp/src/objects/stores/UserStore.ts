import { reactive } from "vue";
import LocalStore, { LocalKey } from "@/objects/stores/LocalStore.ts";
import { i18n } from "@/main.ts";
import { tsi18n } from "@/objects/i18n/index.ts";
import { BoatSize, Player, PlayerDevice } from "@/objects/fleet/Player.ts";
import { clampBanner } from "@/objects/fleet/Banners.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { browserCountry } from "@/objects/utils/BrowserCountry.ts";
import { info } from "@tauri-apps/plugin-log";

export const UserStore = reactive({
  player: {} as Player,
  init(defaultPlayerValue: Player) {
    const userStoreKey = LocalStore(LocalKey.USER_STORE, {});
    const browserLang = navigator.language.substring(0, 2);
    const readPlayer = userStoreKey.value as Player;

    // Use object destructuring to apply saved settings, falling back to default values
    this.player = {
      ...defaultPlayerValue,
      ...readPlayer,
      lang: readPlayer.lang || browserLang,
      // The owner-flag country for the public browser (#672), from the browser locale's region.
      country: readPlayer.country || browserCountry(),
      device: readPlayer.device || PlayerDevice.MICROSOFT,
      boatSize: readPlayer.boatSize || BoatSize.NONE,
      username: keycloakStore.user.username,
      soundEnable:
        readPlayer.soundEnable !== undefined ? readPlayer.soundEnable : true,
      macroEnable:
        readPlayer.macroEnable !== undefined ? readPlayer.macroEnable : true,
      soundLevel: readPlayer.soundLevel || 30,
      // Clamped rather than `|| 0`: 0 is a real choice here (the first template), and the value has
      // to survive whatever an older version happened to leave in localStorage.
      banner: clampBanner(readPlayer.banner),
      bannerShuffle:
        readPlayer.bannerShuffle !== undefined
          ? readPlayer.bannerShuffle
          : false,
      shareStats:
        readPlayer.shareStats !== undefined ? readPlayer.shareStats : true,
      // Re-resolve the effective backend host from the env on every init, never from a bare persisted
      // host: a value saved once (issue #762) shadowed VITE_SOCKET_HOST for the life of the install, so
      // the day the backend URL moved every client stayed pinned to the dead host while HTTP followed
      // the env. Only an explicit developer override wins over the env now, and it travels in its own
      // field so a stale one is told apart from "follow the env". Same in every environment: an install
      // carrying only the old serverHostName falls back to the env value.
      serverHostNameOverride: readPlayer.serverHostNameOverride,
      serverHostName:
        readPlayer.serverHostNameOverride ?? import.meta.env.VITE_SOCKET_HOST,
      clientVersion: import.meta.env.VITE_VERSION,
      fleet: new Fleet(),
      server: undefined,
    };

    i18n.global.locale.value =
      (this.player.lang as "fr" | "en" | "es" | "de") || "en";
    tsi18n.global.locale.value =
      (this.player.lang as "fr" | "en" | "es" | "de") || "en";
    this.player.fleet = new Fleet();
    info("[UserStore.ts] UserStore loaded");
  },
  setUser(user: Player) {
    this.player = user;
  },
  setLang(lang: string) {
    this.player.lang = lang;
    i18n.global.locale.value = (lang as "fr" | "en" | "es" | "de") || "en";
    tsi18n.global.locale.value = (lang as "fr" | "en" | "es" | "de") || "en";
    info("[UserStore.ts] Changed lang to " + lang);
  },
});
