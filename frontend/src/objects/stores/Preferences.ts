import {reactive} from "vue";
import LocalStore, {LocalKey} from "@/objects/stores/LocalStore.ts";
import {i18n} from "@/main.ts";

export interface User {
    name: string
    lang: string
}

export const UserStore = reactive({
    user: {name: "oksour", lang: "en"} as User,
    init() {
        console.log("init")
        const userStoreKey = LocalStore(LocalKey.USER_STORE, {});
        const browserLang = navigator.language.substring(0, 2);
        this.user = userStoreKey.value as User
        this.user.lang = browserLang;
        console.log(browserLang)

        //@ts-ignore I18N typescript implementation
        i18n.global.locale.value = this.user.lang;

    },

    setUser(user: User) {
        this.user = user
    }
});