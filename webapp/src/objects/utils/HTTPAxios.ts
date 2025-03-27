import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { fetch, ResponseType } from "@tauri-apps/api/http";
import { info } from "tauri-plugin-log-api";

export class HTTPAxios {
  private readonly path: string;
  private static readonly header = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE",
    Authorization: "",
  };
  private readonly url = import.meta.env.VITE_BACKEND_HOST + "/";

  constructor(path: string) {
    this.path = path;
  }

  async get(responseType?: ResponseType) {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][GET] " + urlPath);
    return await fetch(urlPath, {
      method: "GET",
      headers: HTTPAxios.header,
      responseType: responseType ? responseType : ResponseType.JSON,
    });
  }

  async post(body: any) {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][POST] " + urlPath);
    return await fetch(urlPath, {
      method: "POST",
      body: { type: "Json", payload: body },
      headers: HTTPAxios.header,
    });
  }

  /*
      async delete() {
        const urlPath = this.url + this.path;
        return await this.axios.delete(urlPath);
      }

      async patch() {
        const urlPath = this.url + this.path;
        return await this.axios.patch(urlPath, this.json);
      }*/

  public static async updateToken() {
    await keycloakStore.keycloak.updateToken(60).then((refresh: boolean) => {
      if (refresh) console.debug("Token was successfully refreshed");
    });
    HTTPAxios.header.Authorization = "Bearer " + keycloakStore.keycloak.token;
  }
}
