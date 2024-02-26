import axios from "axios";

export class HTTPAxios {
    private readonly json: any;
    private readonly path: string;
    private readonly header = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE',
        'Authorization': ''
    };
    private readonly url = import.meta.env.VITE_BACKEND_HOST + "/";
    private axios;

    constructor(path: string, json: any) {
        this.path = path;
        this.json = json;


        this.axios = axios.create({
            baseURL: this.url,
            timeout: Infinity
        });

        this.axios.interceptors.request.use(async config => {
            config.headers.set(this.header)
            return config;
        }, error => {
            return Promise.reject(error);
        });

    }

    async get() {
        const urlPath = this.url + this.path;
        return await this.axios.get(urlPath);
    }

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
    }
}
