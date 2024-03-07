import { reactive } from "vue";
import LocalStore, { LocalKey } from "@/objects/stores/LocalStore.ts";
import { i18n } from "@/main.ts";
import {Player} from "@/objects/Player.ts";

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

    if (!this.player.lang) this.player.lang = browserLang;
    if (!this.player.username) this.player.username = "";
    if (!this.player.serverHostName)
      this.player.serverHostName = import.meta.env.VITE_SOCKET_HOST;

    //@ts-ignore I18N typescript implementation
    i18n.global.locale.value = this.player.lang;
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
