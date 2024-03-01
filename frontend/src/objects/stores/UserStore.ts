import {reactive} from "vue";
import LocalStore, {LocalKey} from "@/objects/stores/LocalStore.ts";
import {i18n} from "@/main.ts";
import type {Player} from "@/objects/Fleet.ts";


export const UserStore = reactive({
    player: {} as Player,
    init(defaultPlayerValue: Player) {
        const userStoreKey = LocalStore(LocalKey.USER_STORE, {});
        const browserLang = navigator.language.substring(0, 2);
        const readedPlayer = userStoreKey.value as Player;
        this.player = defaultPlayerValue;
        this.player.username = readedPlayer.username;
        this.player.lang = readedPlayer.lang;

        if (!this.player.lang) this.player.lang = browserLang;
        if (!this.player.username) this.player.username = "";

        //@ts-ignore I18N typescript implementation
        i18n.global.locale.value = this.player.lang;
    },

    setUser(user: Player) {
        this.player = user;
    },
});
