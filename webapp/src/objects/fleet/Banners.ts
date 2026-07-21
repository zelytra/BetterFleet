/** The app-provided banner templates, served from public/banners/session0..3.svg. */
export const BANNER_COUNT = 4;

/** The asset a banner index points at. */
export function bannerUrl(banner: unknown): string {
  return `/banners/session${clampBanner(banner)}.svg`;
}

/**
 * Keeps a banner index pointing at a template that actually exists.
 *
 * The value survives a round trip through localStorage and the backend, so by the time it reaches a
 * render it is whatever was stored — an old preference, a future version's index, or anything a
 * client chose to send. Out of range it would ask the browser for a banner that isn't there and
 * leave a broken image in the list, so it falls back to the first template instead.
 */
export function clampBanner(banner: unknown): number {
  const index = Math.trunc(Number(banner));
  return Number.isInteger(index) && index >= 0 && index < BANNER_COUNT
    ? index
    : 0;
}

/**
 * The banner a session gets when this player hosts it: a random template if they turned shuffle on,
 * otherwise their fixed pick. Only the host's preference is ever consulted — the backend copies it
 * onto the session at creation and ignores it from everyone who joins.
 *
 * `random` is injectable so the shuffle can be tested without being flaky.
 */
export function resolveHostBanner(
  preferences: { banner?: number; bannerShuffle?: boolean },
  random: () => number = Math.random,
): number {
  if (preferences.bannerShuffle) {
    return Math.min(Math.floor(random() * BANNER_COUNT), BANNER_COUNT - 1);
  }
  return clampBanner(preferences.banner);
}
