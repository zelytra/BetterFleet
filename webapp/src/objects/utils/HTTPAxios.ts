import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { fetch } from "@tauri-apps/plugin-http";
import { info } from "@tauri-apps/plugin-log";

export enum ResponseType {
  JSON = "json",
  Text = "text",
  Binary = "binary",
}

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
    const response = await fetch(urlPath, {
      method: "GET",
      headers: HTTPAxios.header,
    });
    const type = responseType ?? ResponseType.JSON;
    const data = await this.parseResponse(response, type);
    return { data, status: response.status };
  }

  async post(body: any) {
    const urlPath = this.url + this.path;
    info("[HTTPAxios.ts][POST] " + urlPath);
    const response = await fetch(urlPath, {
      method: "POST",
      body: JSON.stringify(body),
      headers: {
        ...HTTPAxios.header,
        "Content-Type": "application/json",
      },
    });
    const data = await this.parseResponse(response, ResponseType.JSON).catch(
      () => null,
    );
    return { data, status: response.status };
  }

  private async parseResponse(response: Response, type: ResponseType) {
    if (type === ResponseType.Text) {
      return await response.text();
    }
    if (type === ResponseType.Binary) {
      return await response.arrayBuffer();
    }
    return await response.json();
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
