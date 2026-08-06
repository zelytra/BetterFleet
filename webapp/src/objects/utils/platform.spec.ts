import { describe, it, expect, afterEach, vi } from "vitest";
import { isLinux } from "@/objects/utils/platform.ts";

describe("isLinux", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("detects the WebKitGTK user agent Tauri reports on Linux", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko)",
    });
    expect(isLinux()).toBe(true);
  });

  it("is false on the Windows WebView2 user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/120.0.0.0",
    });
    expect(isLinux()).toBe(false);
  });

  it("is false on the macOS WKWebView user agent", () => {
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    });
    expect(isLinux()).toBe(false);
  });
});
