import {reactive} from "vue";
import {AxiosResponse} from "axios";
import {GithubRelease} from "@/objects/Github.ts";
import {HTTPAxios} from "@/objects/HTTPAxios.ts";
import {i18n} from "@/main.ts";

export const AppStore = reactive({
  githubRelease: {} as GithubRelease,
  init() {
    new HTTPAxios("github/release/download").get().then((response: AxiosResponse) => {
      this.githubRelease = response.data as GithubRelease
    })
    const browserLang = navigator.language.substring(0, 2);
    i18n.global.locale.value = browserLang as ("fr" | "en" | "es" | "de")
  },
});
