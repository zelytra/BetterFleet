/**
 * The veil between a banner's artwork and the text written over it.
 *
 * The lobby header puts white, grey and `--primary` green straight onto whichever banner the host
 * picked (issue #602), and the four templates are flat, saturated fields: a bright green one, an
 * amber one, and two dark ones carrying lit props. Measured at the app's own window size, over the
 * lane the header text runs through, *every* template fails WCAG AA on *every* one of those three
 * colours - on the green one the console invite lands at 1.00:1, the identical luminance to the
 * field behind it, and the session id at 1.10:1. That is the bug report: the code is not dim, it is
 * not there.
 *
 * A scrim fixes all four at once, which recolouring the text cannot: no single colour reads on both
 * a bright green field and a dark navy one, and the green specifically is the tone the banner is
 * made of. Darkening the backdrop instead keeps the text palette - and the cue that the green id is
 * the thing you click - and leaves the banner recognisable as the one the host chose.
 *
 * Declared here rather than as a literal in the stylesheet, for the reason ServerColor.ts computes
 * its bars: a number in a module is one a test can assert, and BannerTemplate renders exactly the
 * value asserted rather than a copy of it that is free to drift.
 */

/**
 * How far the artwork is pulled toward black under the small text - the session id and the console
 * invite, which need WCAG's 4.5:1.
 *
 * AA across all four templates needs 0.607; this leaves a little over it so a future banner is not
 * one shade of amber away from failing.
 */
export const BANNER_SCRIM_STRONG = 0.66;

/**
 * And under the session name alone, which is 31px - still 4.5:1 rather than the 3:1 WCAG allows
 * large text, because a name at 3:1 beside an id at 6:1 reads as a mistake.
 *
 * Half the strong veil is enough here (0.336 is the floor), which is the point of having two: the
 * name can run most of the banner's width, and holding the full veil that far would flatten the
 * four templates into one dark slab - the one thing the banner is for.
 */
export const BANNER_SCRIM_SOFT = 0.34;

/**
 * Where each zone ends, as a fraction of the banner's width, measured in the shipped 1260x760
 * window (a 1108px banner) with the lobby rendered:
 *
 *   - text starts at 11.9% (36px margin + 64px crest + 32px gap);
 *   - the console invite ends at 22.9% and the session id at 31.0%, so the strong zone covers both;
 *   - the session name ellipsises at 69.4%, inside the soft zone, because `.title-content` caps it
 *     at 62% of the header - uncapped it runs to 97.5%, which would leave no banner to see;
 *   - past the soft zone nothing is written, so the artwork keeps its own light.
 */
export const BANNER_SCRIM_STRONG_END = 0.34;
export const BANNER_SCRIM_SOFT_END = 0.74;
export const BANNER_SCRIM_END = 0.96;

/** Where the header's text ends, from the measurements above. */
export const BANNER_SMALL_TEXT_END = 0.31;
export const BANNER_NAME_END = 0.694;

/** The CSS the scrim layer paints. */
export function bannerScrim(): string {
  const stop = (alpha: number, at: number) =>
    `rgba(0, 0, 0, ${alpha}) ${(at * 100).toFixed(0)}%`;
  return [
    "linear-gradient(90deg,",
    `${stop(BANNER_SCRIM_STRONG, 0)},`,
    `${stop(BANNER_SCRIM_STRONG, BANNER_SCRIM_STRONG_END)},`,
    `${stop(BANNER_SCRIM_SOFT, BANNER_SCRIM_SOFT_END)},`,
    stop(0, BANNER_SCRIM_END) + ")",
  ].join(" ");
}

/** A colour from the artwork as it reads under a given strength of veil. */
export function scrimmed(
  background: readonly [number, number, number],
  alpha: number,
): [number, number, number] {
  return background.map((channel) => channel * (1 - alpha)) as [
    number,
    number,
    number,
  ];
}
