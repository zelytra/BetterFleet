import { beforeEach, describe, expect, it, vi } from "vitest";

// The Linux clipboard fix: the Tauri plugin (Rust-side write) must be tried FIRST - WebKitGTK's
// async Clipboard API rejects on Linux, which is the field report this helper closes out - with
// the webview APIs as fallbacks so the helper still works outside the shell.

let pluginBehaviour: "ok" | "throw" = "ok";
const pluginCalls: string[] = [];

vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({
  writeText: async (text: string) => {
    if (pluginBehaviour === "throw") throw new Error("plugin not found");
    pluginCalls.push(text);
  },
}));
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);

import { copyText } from "@/objects/utils/Clipboard.ts";

describe("copyText (#linux clipboard)", () => {
  beforeEach(() => {
    pluginBehaviour = "ok";
    pluginCalls.length = 0;
  });

  it("writes through the Tauri plugin first", async () => {
    // A webview API that would throw proves the plugin path never reaches it on success.
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("webview clipboard must not be consulted");
        },
      },
    });
    expect(await copyText("session-code")).toBe(true);
    expect(pluginCalls).toEqual(["session-code"]);
    vi.unstubAllGlobals();
  });

  it("falls back to the webview API when the plugin is unavailable", async () => {
    pluginBehaviour = "throw";
    const written: string[] = [];
    vi.stubGlobal("navigator", {
      clipboard: { writeText: async (t: string) => void written.push(t) },
    });
    expect(await copyText("fallback")).toBe(true);
    expect(written).toEqual(["fallback"]);
    expect(pluginCalls).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("reports failure when every path fails, so no false 'copied' confirmation", async () => {
    pluginBehaviour = "throw";
    vi.stubGlobal("navigator", {
      clipboard: {
        writeText: async () => {
          throw new Error("NotAllowedError");
        },
      },
    });
    const execCommand = document.execCommand;
    document.execCommand = () => false;
    expect(await copyText("doomed")).toBe(false);
    document.execCommand = execCommand;
    vi.unstubAllGlobals();
  });
});
