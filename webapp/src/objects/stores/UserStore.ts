import {reactive} from "vue";
import LocalStore, {LocalKey} from "@/objects/stores/LocalStore.ts";
import {i18n} from "@/main.ts";
import {Player, PlayerDevice} from "@/objects/fleet/Player.ts";
import {Fleet} from "@/objects/fleet/Fleet.ts";
import {keycloakStore} from "@/objects/stores/LoginStates.ts";

export const UserStore = reactive({
    player: {} as Player,
    init(defaultPlayerValue: Player) {
      const userStoreKey = LocalStore(LocalKey.USER_STORE, {});
      const browserLang = navigator.language.substring(0, 2);
      const readedPlayer = userStoreKey.value as Player;

      // Use object destructuring to apply saved settings, falling back to default values
      this.player = {
        ...defaultPlayerValue,
        ...readedPlayer,
        lang: readedPlayer.lang || browserLang,
        device: readedPlayer.device || PlayerDevice.MICROSOFT,
        username: readedPlayer.username || keycloakStore.user.username,
        soundEnable: readedPlayer.soundEnable !== undefined ? readedPlayer.soundEnable : true,
        macroEnable: readedPlayer.macroEnable !== undefined ? readedPlayer.macroEnable : true,
        soundLevel: readedPlayer.soundLevel || 30,
        serverHostName: readedPlayer.serverHostName || import.meta.env.VITE_SOCKET_HOST,
        clientVersion: readedPlayer.clientVersion || import.meta.env.VITE_VERSION,
        fleet: new Fleet()
      };

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
  })
;
