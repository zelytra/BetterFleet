export type Platform = "windows" | "linux";

// What a single navigator signal (userAgentData / userAgent / platform) says about the OS:
// a platform we ship for, an explicit "not a target we ship" rejection, or `undefined` for "this
// signal is silent, ask the next one". Keeping rejection distinct from silence is the whole point -
// see the Android note in detectPlatform.
type Classification = Platform | "reject";

/**
 * Best-effort guess at the visitor's desktop OS, so the download screen can put the one download
 * that will actually run in front of them instead of making everyone read every option.
 *
 * `navigator.userAgentData` (Chromium's Client Hints) is checked first - a plain platform string,
 * no user-agent parsing. Everything else (Firefox, Safari, older Chromium) falls back to sniffing
 * `navigator.userAgent`, then `navigator.platform` - what every browser still sends.
 *
 * The three signals are consulted in order and the FIRST that speaks wins, whether it names a
 * platform or rejects one. That ordering is load-bearing: on Android, `navigator.platform` reports
 * `"Linux armv8l"`/`"Linux aarch64"`, so a signal that says "Android" (the userAgentData platform or
 * the UA string) has to be able to STOP the chain rather than merely decline - otherwise a phone
 * falls through to `platform` and is served the desktop-Linux build. So `classify` returns `"reject"`
 * (a phone, a Mac, a console) as a decisive answer, separate from `undefined` (this signal is silent,
 * consult the next one).
 *
 * Returns `null` when the winning signal is a rejection, or when every signal stays silent: the
 * screen treats that as "ask, don't assume" and shows the manual picker with nothing pre-selected.
 */
export function detectPlatform(): Platform | null {
  const uaData = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;

  const result =
    classify(uaData?.platform ?? "") ??
    classify(navigator.userAgent ?? "") ??
    classify(navigator.platform ?? "");

  return result === "reject" || result === undefined ? null : result;
}

/**
 * Reads one navigator signal. Returns a platform, `"reject"` for something we deliberately don't
 * serve, or `undefined` when the signal names nothing we recognise (so the caller consults the next
 * signal). `undefined` is the only value the `??` chain steps past.
 */
function classify(value: string): Classification | undefined {
  const v = value.toLowerCase();
  // Rejected ahead of "linux", and decisively: Android's UA and platform strings both carry "Linux",
  // and a phone is not a desktop Linux visitor - there is no build for it either way. Returning
  // "reject" (not undefined) stops the chain here so `navigator.platform`'s "Linux armv8l" can't
  // later be read as desktop Linux.
  if (v.includes("android")) return "reject";
  // A phone is never a desktop download target. iOS' UA even says "like Mac OS X" for legacy
  // compatibility, so ruling these out first keeps them from being read as something we ship.
  if (v.includes("iphone") || v.includes("ipad") || v.includes("ipod")) {
    return "reject";
  }
  if (v.includes("win")) return "windows";
  // ChromeOS ("CrOS"/"X11" in the UA) is offered the Linux packages: its Crostini container is
  // Debian, so the `.deb` installs there. Grouped with desktop Linux deliberately.
  if (v.includes("linux") || v.includes("x11") || v.includes("cros")) {
    return "linux";
  }
  // Anything else - macOS included, since there is no Mac build - is silent here; the next signal
  // gets a turn, and if they all stay silent the caller shows the manual picker.
  return undefined;
}
