import { HTTPAxios } from "@/objects/HTTPAxios.ts";
import { AxiosResponse } from "axios";

// Client for the anonymous alliance-formation analytics (issue #673). Consumes the backend
// aggregations exposed by AllianceStatsEndpoints (/stats/alliance, /stats/regions).

export interface HeatCell {
  dayOfWeek: number; // 1 (Mon) .. 7 (Sun), UTC
  hour: number; // 0..23, UTC
  attempts: number;
  converged: number;
  rate: number; // converged / attempts
}

export interface AllianceStats {
  totalAttempts: number;
  converged: number;
  convergenceRate: number;
  averageTries: number;
  heatmap: HeatCell[];
  bestHours: number[]; // UTC hours with the highest convergence rate (min-sample applied)
  minSample: number;
}

export interface RegionCount {
  region: string; // lowercase ISO 3166-1 alpha-2
  attempts: number;
}

export async function fetchAllianceStats(
  ownerRegion?: string,
  serverRegion?: string,
): Promise<AllianceStats> {
  const query = new URLSearchParams();
  if (ownerRegion) query.set("ownerRegion", ownerRegion);
  if (serverRegion) query.set("serverRegion", serverRegion);
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response: AxiosResponse = await new HTTPAxios(
    `stats/alliance${suffix}`,
    null,
  ).get();
  return response.data as AllianceStats;
}

export async function fetchRegions(): Promise<RegionCount[]> {
  const response: AxiosResponse = await new HTTPAxios(
    "stats/regions",
    null,
  ).get();
  return response.data as RegionCount[];
}
