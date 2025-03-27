import axios, { AxiosRequestConfig } from "axios";

export class HTTPAxios {
  private axios;
  private readonly json: any;
  private readonly path: string;

  private readonly header = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE",
  };
  private readonly url = import.meta.env.VITE_BACKEND_HOST + "/";
  public isAuth = false;

  constructor(path: string, json?: any) {
    this.path = path;
    this.json = json;

    this.axios = axios.create({
      baseURL: this.url,
      timeout: 10000,
      headers: this.header,
    });
  }

  async get() {
    console.debug("[GET] " + this.url + this.path);
    const urlPath = this.url + this.path;
    return await this.axios.get(urlPath);
  }

  async post(options?: AxiosRequestConfig) {
    console.debug("[POST] " + this.url + this.path);
    const urlPath = this.url + this.path;
    return await this.axios.post(urlPath, this.json, options);
  }

  async delete() {
    console.debug("[DELETE] " + this.url + this.path);
    const urlPath = this.url + this.path;
    return await this.axios.delete(urlPath, this.json);
  }

  async patch() {
    console.debug("[PATCH] " + this.url + this.path);
    const urlPath = this.url + this.path;
    return await this.axios.patch(urlPath, this.json);
  }
}
