export type Platform = "windows" | "linux";

/**
 * Best-effort guess at the visitor's desktop OS, so the download screen can put the one download
 * that will actually run in front of them instead of making everyone read every option.
 *
 * `navigator.userAgentData` (Chromium's Client Hints) is checked first — a plain platform string,
 * no user-agent parsing. Everything else (Firefox, Safari, older Chromium) falls back to sniffing
 * `navigator.userAgent`, then `navigator.platform` — what every browser still sends.
 *
 * Returns `null` rather than guessing when nothing matches a platform we actually ship for: a
 * phone, a Mac (there is no macOS build), a console browser, ChromeOS, whatever. The screen treats
 * that as "ask, don't assume" and shows the manual picker with nothing pre-selected.
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
  // A phone is never a desktop download target. iOS' UA even says "like Mac OS X" for legacy
  // compatibility, so ruling these out first keeps them from being read as something we ship.
  if (v.includes("iphone") || v.includes("ipad") || v.includes("ipod")) {
    return null;
  }
  if (v.includes("win")) return "windows";
  if (v.includes("linux") || v.includes("x11") || v.includes("cros")) {
    return "linux";
  }
  // Anything else — macOS included, since there is no Mac build — falls through to the manual picker.
  return null;
}
