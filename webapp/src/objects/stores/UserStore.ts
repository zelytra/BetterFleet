import {reactive} from "vue";
import LocalStore, {LocalKey} from "@/objects/stores/LocalStore.ts";
import {i18n} from "@/main.ts";
import {Player, PlayerDevice} from "@/objects/Player.ts";
import {Fleet} from "@/objects/Fleet.ts";

export const UserStore = reactive({
  player: {} as Player,
  init(defaultPlayerValue: Player) {
    const userStoreKey = LocalStore(LocalKey.USER_STORE, {});
    const browserLang = navigator.language.substring(0, 2);
    const readedPlayer = userStoreKey.value as Player;
    this.player = defaultPlayerValue;
    this.player.username = readedPlayer.username;
    this.player.lang = readedPlayer.lang;
    this.player.serverHostName = readedPlayer.serverHostName;
    this.player.device = readedPlayer.device;

    if (!this.player.lang) this.player.lang = browserLang;
    if (!this.player.device) this.player.device = PlayerDevice.MICROSOFT;
    if (!this.player.username) this.player.username = "";
    if (!this.player.serverHostName) {
      this.player.serverHostName = import.meta.env.VITE_SOCKET_HOST;
    }

    if (!this.player.clientVersion) {
      this.player.clientVersion = import.meta.env.VITE_VERSION;
    }

    //@ts-ignore I18N typescript implementation
    i18n.global.locale.value = this.player.lang;
    this.player.fleet = new Fleet();
  },

  setUser(user: Player) {
    this.player = user;
  },

  setLang(lang: string) {
    //@ts-ignore I18N typescript implementation
    this.player.lang = lang;
    i18n.global.locale.value = (this.player.lang as "fr") || "en";
  },
});
