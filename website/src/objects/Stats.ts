import { HTTPAxios } from "@/objects/HTTPAxios.ts";

export interface Stats {
  date: Date;
  download: number;
  sessionsOpen: number;
  sessionTry: number;
}

export async function incrementDownload() {
  new HTTPAxios("stats/download", null)
    .post(undefined)
    .then()
    .catch((e) => console.log(e));
}

/**
 * The per-day statistics rows, oldest first. The backend stores one row per UTC day (downloads,
 * sessions opened, set-sail tries); `date` arrives as "yyyy-MM-dd" and is revived to a Date here so
 * chart code never re-parses it.
 */
export async function fetchStatsHistory(): Promise<Stats[]> {
  const response = await new HTTPAxios("stats/history").get();
  const rows = response.data as (Omit<Stats, "date"> & { date: string })[];
  return rows.map((row) => ({ ...row, date: new Date(row.date) }));
}
