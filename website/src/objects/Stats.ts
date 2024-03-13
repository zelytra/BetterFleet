import {HTTPAxios} from "@/objects/HTTPAxios.ts";

export interface Stats {
  date: Date,
  download: number,
  sessionsOpen: number,
  sessionTry: number
}

export async function incrementDownload() {
  new HTTPAxios("stats/download", null).post(undefined).then().catch((e)=>console.log(e));
}