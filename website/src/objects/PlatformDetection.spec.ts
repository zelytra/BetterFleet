import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPlatform } from "@/objects/PlatformDetection.ts";

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
  it("reads Windows from userAgentData when present", () => {
    stubNavigator({ userAgentData: { platform: "Windows" } });
    expect(detectPlatform()).toBe("windows");
  });

  it("falls back to the user-agent string when userAgentData is absent", () => {
    stubNavigator({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    expect(detectPlatform()).toBe("windows");
  });

  it("returns null for macOS, which has no build", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("recognises a desktop Linux user agent", () => {
    stubNavigator({
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
    });
    expect(detectPlatform()).toBe("linux");
  });

  it("does not mistake Android (whose UA also carries 'Linux') for desktop Linux", () => {
    stubNavigator({
      userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("does not mistake iOS (whose UA says 'like Mac OS X') for a desktop platform", () => {
    stubNavigator({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
    });
    expect(detectPlatform()).toBeNull();
  });

  it("returns null when nothing matches a platform BetterFleet ships for", () => {
    stubNavigator({ userAgent: "some-obscure-browser/1.0" });
    expect(detectPlatform()).toBeNull();
  });

  it("prefers userAgentData over the user-agent string when both are present", () => {
    stubNavigator({
      userAgentData: { platform: "Linux" },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    });
    expect(detectPlatform()).toBe("linux");
  });
});
