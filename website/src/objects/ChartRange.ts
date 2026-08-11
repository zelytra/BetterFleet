/**
 * The time windows every daily chart on the statistics page can be narrowed to, and the one slicing
 * rule they share. Kept out of the cards so the downloads and activity charts (and any future daily
 * series) pick from the same windows and behave identically.
 */
export const RANGES = [
  { id: "all", days: null },
  { id: "year", days: 365 },
  { id: "quarter", days: 90 },
  { id: "month", days: 30 },
] as const;

export type RangeId = (typeof RANGES)[number]["id"];

/**
 * The last N days of a daily series for the window, or the whole series for "all". Anchored on the
 * series' last entry rather than the wall clock, so lagging stats still show a full window.
 */
export function sliceLastDays<T>(series: T[], rangeId: RangeId): T[] {
  const range = RANGES.find((entry) => entry.id === rangeId);
  if (!range?.days) return series;
  return series.slice(Math.max(0, series.length - range.days));
}
