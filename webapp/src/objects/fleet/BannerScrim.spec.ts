import { describe, expect, it } from "vitest";
import { BANNER_COUNT } from "@/objects/fleet/Banners.ts";
import {
  BANNER_NAME_END,
  BANNER_SCRIM_END,
  BANNER_SCRIM_SOFT,
  BANNER_SCRIM_SOFT_END,
  BANNER_SCRIM_STRONG,
  BANNER_SCRIM_STRONG_END,
  BANNER_SMALL_TEXT_END,
  bannerScrim,
  scrimmed,
} from "@/objects/fleet/BannerScrim.ts";

/**
 * The brightest patch of each shipped template inside the lane the header text runs through - the
 * worst backdrop a glyph can land on, which is what decides whether the text can be read.
 *
 * Sampled at glyph scale (15x8px blocks) rather than averaged: the mean of the green banner is a
 * comfortable-looking mid-green, and it is the lit top of the field that swallows the session id.
 * Taken at the banner's size in the app's shipped 1260x760 window:
 *
 *   magick public/banners/session$i.webp -resize 1200x120^ -gravity center -extent 1200x120 \
 *     -crop 630x80+132+20 +repage -resize 42x10\! -compress none out.ppm
 *
 * then the block with the highest WCAG luminance. Re-run it when a template is redrawn.
 */
const BANNER_WORST: Record<number, [number, number, number]> = {
  0: [142, 135, 127], // lit barrel staves, left of the chest
  1: [68, 201, 142], // the bright green field itself
  2: [196, 118, 38], // the amber field
  3: [245, 152, 65], // the lit orange skull
};

/** The three colours the lobby header writes on a banner, from style.scss. */
const SMALL_TEXT = {
  "the session id (--primary, 16px)": [50, 212, 153],
  "the console invite (--secondary-text, 12px)": [179, 179, 179],
};
const LARGE_TEXT = {
  "the session name (--primary-text, 31px)": [255, 255, 255],
};

/** WCAG relative luminance. */
const luminance = ([r, g, b]: number[]) => {
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: number[], b: number[]) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

/** Every pairing of header text with the template it is written on, under a given veil. */
function failures(text: Record<string, number[]>, alpha: number): string[] {
  const found: string[] = [];
  for (let banner = 0; banner < BANNER_COUNT; banner++) {
    const backdrop = scrimmed(BANNER_WORST[banner], alpha);
    for (const [what, color] of Object.entries(text)) {
      const ratio = contrast(color, backdrop);
      if (ratio < 4.5) {
        found.push(`banner ${banner}: ${what} is only ${ratio.toFixed(2)}:1`);
      }
    }
  }
  return found;
}

describe("the banner scrim", () => {
  it("carries the session id and the console invite to AA on every template", () => {
    // The reason this module exists. Unveiled, all twelve pairings fail, and the green template -
    // the one in the report - is the extreme: its console invite sits at 1.00:1, the identical
    // luminance to the field, and its session id at 1.10:1. Collected rather than asserted inside
    // the loop: the first failure alone would hide that this is every template, not one unlucky one.
    expect(failures(SMALL_TEXT, BANNER_SCRIM_STRONG)).toEqual([]);
  });

  it("carries the session name to AA where the veil has already softened", () => {
    // The name outruns the strong zone, so it is the soft one that has to hold it - at 4.5:1 and
    // not the 3:1 WCAG would allow a 31px glyph, because a name dimmer than the id under it reads
    // as a mistake rather than as a hierarchy.
    expect(failures(LARGE_TEXT, BANNER_SCRIM_SOFT)).toEqual([]);
  });

  it("is measured for every template the picker offers", () => {
    // A fifth banner added without a measurement would be veiled by the same scrim and never
    // checked against it - which is how the green one shipped.
    expect(Object.keys(BANNER_WORST).map(Number).sort()).toEqual(
      Array.from({ length: BANNER_COUNT }, (_, i) => i),
    );
  });

  it("holds full strength across the small text", () => {
    // The id and the invite are 16px and 12px: they need the strong veil for their whole length,
    // and the strong zone ending even slightly early would fade out the tail of the code.
    expect(BANNER_SCRIM_STRONG_END).toBeGreaterThanOrEqual(
      BANNER_SMALL_TEXT_END,
    );
  });

  it("has softened, but not lifted, by the end of the longest name", () => {
    // `.title-content`'s max-width and these stops are two halves of one decision: a name is
    // allowed to run exactly as far as the soft veil still covers it.
    expect(BANNER_NAME_END).toBeGreaterThan(BANNER_SCRIM_STRONG_END);
    expect(BANNER_NAME_END).toBeLessThanOrEqual(BANNER_SCRIM_SOFT_END);
  });

  it("softens and lifts in that order, and lets the artwork back", () => {
    // Darkening the whole strip would make the four templates one slab and throw away the thing
    // the host picked.
    expect(BANNER_SCRIM_SOFT).toBeLessThan(BANNER_SCRIM_STRONG);
    expect(BANNER_SCRIM_STRONG_END).toBeLessThan(BANNER_SCRIM_SOFT_END);
    expect(BANNER_SCRIM_SOFT_END).toBeLessThan(BANNER_SCRIM_END);
    expect(BANNER_SCRIM_END).toBeLessThanOrEqual(1);
  });

  it("paints the strengths it declares", () => {
    // BannerTemplate renders this string: a literal in the stylesheet instead would be a copy of
    // the numbers the assertions above are made of, free to drift from them.
    expect(bannerScrim()).toBe(
      "linear-gradient(90deg, rgba(0, 0, 0, 0.66) 0%, rgba(0, 0, 0, 0.66) 34%," +
        " rgba(0, 0, 0, 0.34) 74%, rgba(0, 0, 0, 0) 96%)",
    );
  });
});
