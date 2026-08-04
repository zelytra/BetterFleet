export type Platform = "windows" | "linux" | "macos";

/**
 * Best-effort guess at the visitor's desktop OS, so the download screen can put the one download
 * that will actually run in front of them instead of making everyone read three options.
 *
 * `navigator.userAgentData` (Chromium's Client Hints) is checked first — a plain platform string,
 * no user-agent parsing. Everything else (Firefox, Safari, older Chromium) falls back to sniffing
 * `navigator.userAgent`, then `navigator.platform` — what every browser still sends.
 *
 * Returns `null` rather than guessing when nothing matches a platform we actually ship for: a
 * phone, a console browser, ChromeOS, whatever. The screen treats that as "ask, don't assume" and
 * shows the manual picker with nothing pre-selected.
 */
export function detectPlatform(): Platform | null {
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;

  return (
    classify(uaData?.platform ?? "") ??
    classify(navigator.userAgent ?? "") ??
    classify(navigator.platform ?? "")
  );
}

function classify(value: string): Platform | null {
  const v = value.toLowerCase();
  // Checked ahead of "linux": Android's UA string carries "Linux" too, and a phone is not a desktop
  // Linux visitor — there is no build for it either way.
  if (v.includes("android")) return null;
  // Checked ahead of "mac": iOS Safari's UA string says "like Mac OS X" for legacy compatibility, so
  // an iPhone/iPad would otherwise be read as desktop macOS.
  if (v.includes("iphone") || v.includes("ipad") || v.includes("ipod")) {
    return null;
  }
  if (v.includes("win")) return "windows";
  if (v.includes("mac")) return "macos";
  if (v.includes("linux") || v.includes("x11") || v.includes("cros")) {
    return "linux";
  }
  return null;
}
