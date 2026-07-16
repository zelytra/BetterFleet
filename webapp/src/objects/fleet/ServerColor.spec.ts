import { describe, expect, it } from "vitest";
import { serverBarColor } from "@/objects/fleet/ServerColor.ts";

/** Every colour SotServer#getRandomColor can hand out. */
const PALETTE = [
  "#32D499",
  "#32CAD4",
  "#327DD4",
  "#9632D4",
  "#D132D4",
  "#D43289",
  "#D4324F",
  "#D43232",
  "#32D45F",
  "#32D438",
  "#83D432",
  "#BDD432",
  "#D49332",
  "#D47632",
  "#D45932",
  "#D44F32",
  "#D37070",
  "#D3A070",
  "#ADD370",
  "#70D37A",
  "#7092D3",
  "#9C70D3",
  "#D370C9",
  "#D37082",
];

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [
    number,
    number,
    number,
  ];

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

const WHITE = [255, 255, 255];

describe("serverBarColor", () => {
  it("keeps the title readable on every colour the backend can pick", () => {
    // The reason this module exists. The palette was only ever a 2px border and coloured text; the
    // title bar puts white on top of it, and raw, 20 of these 24 fail AA — "#32D499" lands at 1.91:1.
    for (const color of PALETTE) {
      const ratio = contrast(rgb(serverBarColor(color)), WHITE);
      expect(
        ratio,
        `white on the bar for ${color} is only ${ratio.toFixed(2)}:1`,
      ).toBeGreaterThan(4);
    }
  });

  it("still tells the servers apart", () => {
    // Darkening far enough would make every bar the same near-black and throw away the one thing the
    // colour is for: knowing at a glance who is on your server.
    const bars = PALETTE.map(serverBarColor);
    expect(new Set(bars).size).toBe(PALETTE.length);
  });

  it("keeps each colour recognisable as itself", () => {
    // The bar must still read as the server's colour, not as a generic dark slab: the border beside
    // it is the raw colour, and the two sitting together should look related.
    for (const color of PALETTE) {
      const [r, g, b] = rgb(color);
      const [br, bg, bb] = rgb(serverBarColor(color));
      const brightest = Math.max(r, g, b);
      const barBrightest = Math.max(br, bg, bb);
      // the dominant channel stays dominant
      expect([br, bg, bb].indexOf(barBrightest)).toBe(
        [r, g, b].indexOf(brightest),
      );
    }
  });

  it("hands back anything that is not a colour untouched", () => {
    // The colour arrives over the socket inside the fleet payload, so it is whatever a client sent.
    // Mangling it into "#NaNNaNNaN" would paint the bar transparent and lose the title entirely.
    for (const junk of [
      "",
      "red",
      "#fff",
      "not a colour",
      "#12345",
      "#1234567",
    ]) {
      expect(serverBarColor(junk)).toBe(junk);
    }
  });

  it("is case-insensitive and tolerates a missing hash", () => {
    expect(serverBarColor("#32d499")).toBe(serverBarColor("#32D499"));
    expect(serverBarColor("32D499")).toBe(serverBarColor("#32D499"));
  });
});
