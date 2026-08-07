import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPlatform } from "@/objects/PlatformDetection.ts";

// Every case supplies the full triple a real browser reports - userAgentData.platform, userAgent AND
// navigator.platform - because the bug this guards against only surfaces when all three are present:
// Android's navigator.platform is "Linux armv8l", so a stub that leaves it "" can't reproduce a phone
// being served the desktop-Linux build.
function stubNavigator(overrides: {
  userAgent?: string;
  platform?: string;
  userAgentData?: { platform?: string };
}) {
  vi.stubGlobal("navigator", {
    userAgent: overrides.userAgent ?? "",
    platform: overrides.platform ?? "",
    userAgentData: overrides.userAgentData,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("detectPlatform", () => {
  it("reads Windows from userAgentData (Chrome)", () => {
    stubNavigator({
      userAgentData: { platform: "Windows" },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      platform: "Win32",
    });
    expect(detectPlatform()).toBe("windows");
  });

  it("reads Windows from the user-agent string when userAgentData is absent (Firefox)", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
      platform: "Win32",
    });
    expect(detectPlatform()).toBe("windows");
  });

  it("recognises desktop Linux (Chrome)", () => {
    stubNavigator({
      userAgentData: { platform: "Linux" },
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      platform: "Linux x86_64",
    });
    expect(detectPlatform()).toBe("linux");
  });

  it("recognises desktop Linux (Firefox, no userAgentData)", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
      platform: "Linux x86_64",
    });
    expect(detectPlatform()).toBe("linux");
  });

  it("treats ChromeOS as Linux (Crostini runs the .deb)", () => {
    stubNavigator({
      userAgentData: { platform: "Chrome OS" },
      userAgent:
        "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      platform: "Linux x86_64",
    });
    expect(detectPlatform()).toBe("linux");
  });

  it("returns null for macOS, which has no build", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("returns null for an iPad in desktop mode (indistinguishable from a Mac)", () => {
    // Since iPadOS 13, Safari's "desktop" default reports itself as a Mac, platform included. There is
    // no build for either, so falling through to the macOS -> null path is the right answer.
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      platform: "MacIntel",
    });
    expect(detectPlatform()).toBeNull();
  });

  // The regression guard: real Android reports navigator.platform "Linux armv8l"/"Linux aarch64". If a
  // rejection can't stop the detection chain, the phone falls through to that and is read as desktop
  // Linux. Each mobile case below carries the real "Linux armv8l" platform so it actually exercises it.
  it("does not serve Android Chrome the desktop-Linux build (regression guard)", () => {
    stubNavigator({
      userAgentData: { platform: "Android" },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("does not serve Android Firefox (no userAgentData) the desktop-Linux build", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0",
      platform: "Linux armv8l",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("does not serve Samsung Internet (Android) the desktop-Linux build", () => {
    stubNavigator({
      userAgentData: { platform: "Android" },
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
      platform: "Linux armv8l",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("returns null for iOS (whose UA says 'like Mac OS X')", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("returns null when nothing matches a platform BetterFleet ships for", () => {
    stubNavigator({ userAgent: "some-obscure-browser/1.0", platform: "" });
    expect(detectPlatform()).toBeNull();
  });

  it("prefers userAgentData over the user-agent string when both are present", () => {
    stubNavigator({
      userAgentData: { platform: "Linux" },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
    });
    expect(detectPlatform()).toBe("linux");
  });
});
