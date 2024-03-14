import {reactive} from "vue";
import {AxiosResponse} from "axios";
import {GithubRelease} from "@/objects/Github.ts";
import {HTTPAxios} from "@/objects/HTTPAxios.ts";


export const AppStore = reactive({
  githubRelease: {} as GithubRelease,
  init() {
    new HTTPAxios("github/release/download").get().then((response: AxiosResponse) => {
      this.githubRelease = response.data as GithubRelease
    })
  },
});
