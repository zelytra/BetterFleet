/** The app background the server cards sit on (--primary-background-static). */
const BACKGROUND: [number, number, number] = [23, 26, 33];

/**
 * How far each server colour is pulled toward the background for the title bar.
 *
 * The palette is 25 saturated colours picked at random by the backend, and they were only ever used
 * as a thin border and as coloured text. Filling a bar with them puts white text on top, and at full
 * saturation 20 of the 24 fail WCAG AA against white — "#32D499" lands at 1.91:1, which is a label
 * you cannot read. Pulling them toward the background darkens every one of them by the same amount,
 * which keeps them all telling apart (the point of the colour) while making white legible on each.
 */
const BAR_MIX = 0.55;

function parse(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The title bar's fill for a server colour.
 *
 * Mixed here rather than with CSS `color-mix` or an rgba() overlay: the app ships in a Tauri v1
 * webview, and computing it means the result is one flat hex that renders the same everywhere and can
 * be asserted in a test. Falls back to the raw string when the colour is not a hex the backend sent —
 * it arrives over the socket, so it is whatever a client chose to send.
 */
export function serverBarColor(color: string): string {
  const rgb = parse(color);
  if (!rgb) return color;
  const mixed = rgb.map((channel, i) =>
    Math.round(channel * BAR_MIX + BACKGROUND[i] * (1 - BAR_MIX)),
  );
  return "#" + mixed.map((c) => c.toString(16).padStart(2, "0")).join("");
}
