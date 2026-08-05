import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { fetch } from "@tauri-apps/plugin-http";
import { info } from "@tauri-apps/plugin-log";

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

  async get() {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][GET] " + urlPath);
    // v2 plugin-http is WHATWG-fetch-shaped: it returns a standard Response, so callers read the
    // body with `await res.json()` / `await res.text()` (there is no v1 `responseType`/`.data`).
    return await fetch(urlPath, {
      method: "GET",
      headers: HTTPAxios.header,
    });
  }

  async post(body: any) {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][POST] " + urlPath);
    // v2 fetch takes a WHATWG BodyInit: send a JSON string and declare the content type (v1's
    // `Body.json()` helper is gone).
    return await fetch(urlPath, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { ...HTTPAxios.header, "Content-Type": "application/json" },
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
