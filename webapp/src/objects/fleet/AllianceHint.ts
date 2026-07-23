import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { info } from "tauri-plugin-log-api";

// Lobby hint fed by the anonymous alliance statistics (#683). The backend already aggregates
// every attempt (#673); this turns one GET /stats/alliance into "when is it worth trying" advice
// shown where the decision is made. Fetches at most once an hour, fails to silence.

export interface HeatCell {
  dayOfWeek: number; // 1 (Mon) .. 7 (Sun), UTC
  hour: number; // 0..23, UTC
  attempts: number;
  converged: number;
  rate: number;
}

export interface AllianceStatsPayload {
  totalAttempts: number;
  converged: number;
  convergenceRate: number;
  averageTries: number;
  heatmap: HeatCell[];
  bestHours: number[]; // UTC hours with the top convergence rate, min-sample applied server-side
  minSample: number;
}

/** What the lobby renders: a local-time window, its rate, and — when trustworthy — the current rate. */
export interface AllianceHint {
  /** e.g. "05:00–08:00", already converted to the player's local time. */
  localRange: string;
  /** Convergence rate of the best window, 0-100 rounded. */
  bestRate: number;
  /** Convergence rate of the current hour (all days pooled), 0-100 — null below the min sample. */
  nowRate: number | null;
}

const CACHE_MS = 60 * 60 * 1000;
let cache: { at: number; payload: AllianceStatsPayload | null } | null = null;

/** Cached fetch: one backend call an hour at most; any failure yields null (the hint just hides). */
export async function fetchAllianceStats(): Promise<AllianceStatsPayload | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.payload;
  }
  try {
    const response = await new HTTPAxios("stats/alliance").get();
    cache = { at: Date.now(), payload: response.data as AllianceStatsPayload };
    info("[AllianceHint] stats refreshed");
  } catch {
    cache = { at: Date.now(), payload: null };
  }
  return cache.payload;
}

/** Test seam: drops the cache so specs can exercise fetch behaviour deterministically. */
export function resetAllianceHintCache(): void {
  cache = null;
}

function pad(hour: number): string {
  return String(hour).padStart(2, "0") + ":00";
}

/**
 * Picks, from the tied-top UTC hours the backend reports, the consecutive run containing the most
 * hours (wrapping midnight), so "best window" reads as one range instead of scattered hours.
 * Exported for tests.
 */
export function bestWindow(
  bestHours: number[],
): { start: number; end: number } | null {
  if (!bestHours.length) return null;
  const set = new Set(bestHours);
  let best: { start: number; length: number } | null = null;
  for (const hour of bestHours) {
    if (set.has((hour + 23) % 24)) continue; // not the start of a run
    let length = 1;
    while (set.has((hour + length) % 24) && length < 24) length++;
    if (!best || length > best.length) best = { start: hour, length };
  }
  // Every hour ties (full circle): the window is meaningless.
  if (!best || best.length >= 24) return null;
  return { start: best.start, end: (best.start + best.length) % 24 };
}

/**
 * Builds the hint from the payload. Pure: the current UTC hour and the UTC->local conversion are
 * injected so the whole thing is unit-testable.
 */
export function computeHint(
  payload: AllianceStatsPayload | null,
  nowUtcHour: number,
  toLocalHour: (utcHour: number) => number,
): AllianceHint | null {
  if (!payload || !payload.heatmap.length) return null;

  const window = bestWindow(payload.bestHours);
  if (!window) return null;

  // Pool each hour across the week: the "now" rate wants all the data the hour has.
  const byHour = new Map<number, { attempts: number; converged: number }>();
  for (const cell of payload.heatmap) {
    const hour = byHour.get(cell.hour) ?? { attempts: 0, converged: 0 };
    hour.attempts += cell.attempts;
    hour.converged += cell.converged;
    byHour.set(cell.hour, hour);
  }

  const bestBucket = byHour.get(window.start);
  if (!bestBucket || bestBucket.attempts < payload.minSample) return null;
  const bestRate = Math.round(
    (bestBucket.converged / bestBucket.attempts) * 100,
  );

  const nowBucket = byHour.get(nowUtcHour);
  const nowRate =
    nowBucket && nowBucket.attempts >= payload.minSample
      ? Math.round((nowBucket.converged / nowBucket.attempts) * 100)
      : null;

  return {
    localRange:
      pad(toLocalHour(window.start)) + "–" + pad(toLocalHour(window.end)),
    bestRate,
    nowRate,
  };
}

/** The conversion the app actually uses: today's timezone offset applied to a UTC hour. */
export function utcHourToLocal(utcHour: number): number {
  const date = new Date();
  date.setUTCHours(utcHour, 0, 0, 0);
  return date.getHours();
}
