import {keycloakStore} from "@/objects/stores/LoginStates.ts";
import {fetch, ResponseType} from "@tauri-apps/api/http";

export class HTTPAxios {
  //private readonly json: any;
  private readonly path: string;
  private static readonly header = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE',
    'Authorization': ''
  };
  private readonly url = import.meta.env.VITE_BACKEND_HOST + "/";

  constructor(path: string, _json?: any) {
    this.path = path;
    //this.json = json;
  }

  async get(responseType?: ResponseType) {
    const urlPath = this.url + this.path;
    return await fetch(urlPath, {
      method: "GET",
      headers: HTTPAxios.header,
      responseType: responseType ? responseType : ResponseType.JSON
    });
  }

  /*
    async post(options: any) {
      const urlPath = this.url + this.path;
      return await this.axios.post(urlPath, this.json, options);
    }

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
    HTTPAxios.header.Authorization = 'Bearer ' + keycloakStore.keycloak.token;
  }
}
