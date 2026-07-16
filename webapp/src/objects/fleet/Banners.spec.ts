import { describe, expect, it } from "vitest";
import {
  BANNER_COUNT,
  bannerUrl,
  clampBanner,
  resolveHostBanner,
} from "@/objects/fleet/Banners.ts";

describe("clampBanner", () => {
  it("keeps every real template", () => {
    for (let i = 0; i < BANNER_COUNT; i++) {
      expect(clampBanner(i)).toBe(i);
    }
  });

  it("keeps 0, which is a real choice rather than a missing one", () => {
    expect(clampBanner(0)).toBe(0);
  });

  // The value comes back from localStorage and from the backend, so by the time it is rendered it
  // is whatever was stored — an out-of-range index would leave a broken image in the list.
  it.each([
    ["out of range", BANNER_COUNT],
    ["negative", -1],
    ["not a number", "nope"],
    ["undefined", undefined],
    ["null", null],
    ["fractional", 1.5],
    ["NaN", NaN],
    ["Infinity", Infinity],
  ])(
    "falls back to the first template when the index is %s",
    (_label, value) => {
      const result = clampBanner(value);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(BANNER_COUNT);
    },
  );
});

describe("bannerUrl", () => {
  it("points at the template asset", () => {
    expect(bannerUrl(2)).toBe("/banners/session2.svg");
  });

  it("never points at a template that does not exist", () => {
    expect(bannerUrl(99)).toBe("/banners/session0.svg");
  });
});

describe("resolveHostBanner", () => {
  it("uses the fixed pick when shuffle is off", () => {
    expect(resolveHostBanner({ banner: 2, bannerShuffle: false })).toBe(2);
  });

  it("ignores the fixed pick when shuffle is on", () => {
    expect(
      resolveHostBanner({ banner: 2, bannerShuffle: true }, () => 0.8),
    ).toBe(3);
  });

  it("only ever shuffles onto a template that exists", () => {
    // Including the boundary: Math.random() can return values arbitrarily close to 1, and
    // Math.floor(0.999... * 4) must not land on a fifth banner.
    for (const r of [0, 0.24, 0.25, 0.5, 0.75, 0.999999, 1 - Number.EPSILON]) {
      const result = resolveHostBanner(
        { banner: 0, bannerShuffle: true },
        () => r,
      );
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThan(BANNER_COUNT);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  it("spreads across every template", () => {
    const seen = new Set(
      [0.1, 0.3, 0.6, 0.9].map((r) =>
        resolveHostBanner({ banner: 0, bannerShuffle: true }, () => r),
      ),
    );
    expect(seen).toEqual(new Set([0, 1, 2, 3]));
  });

  it("clamps a stored pick that no longer exists", () => {
    expect(resolveHostBanner({ banner: 99, bannerShuffle: false })).toBe(0);
  });

  it("copes with preferences that predate the setting", () => {
    expect(resolveHostBanner({})).toBe(0);
  });
});
