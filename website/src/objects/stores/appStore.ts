import {reactive} from "vue";
import axios, {AxiosResponse} from "axios";
import {GithubRelease, TauriRelease} from "@/objects/Github.ts";


export const AppStore = reactive({
  tauriRelease: {} as TauriRelease,
  githubRelease: {} as GithubRelease,
  init() {
    axios.get("https://github.com/zelytra/BetterFleet/releases/latest/download/latest.json").then((resonse: AxiosResponse) => {
      this.tauriRelease = resonse.data as TauriRelease;
      this.githubRelease = {
        url: this.tauriRelease.platforms["windows-x86_64"].url.replace("nsis.zip", "exe"),
        publicationDate: new Date(this.tauriRelease.pub_date),
        version: this.tauriRelease.version
      }
    })
  },
});
