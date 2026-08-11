import { describe, expect, it, vi } from "vitest";

// The updater module imports plugin-log at the top; stub it so importing the pure helper under
// vitest does not reach for the Tauri bridge. plugin-updater/plugin-process are dynamic imports
// inside the functions, so they never load here.
vi.mock("@tauri-apps/plugin-log", async () => ({
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
}));

import { resolveNotes } from "@/objects/Updater.ts";

describe("resolveNotes", () => {
  it("prefers the fetched notes when present", () => {
    expect(resolveNotes(["a", "b"], "## from manifest")).toEqual(["a", "b"]);
  });

  it("falls back to the manifest body, simplified, when the fetch returned nothing", () => {
    // simplifyReleaseNotes strips the markdown heading; the point is the fallback engages.
    expect(resolveNotes(null, "## New in this build\n- fixed a crash")).toEqual(
      ["New in this build", "- fixed a crash"],
    );
  });

  it("falls back to the manifest body when the fetch returned an empty list", () => {
    expect(resolveNotes([], "just one line")).toEqual(["just one line"]);
  });

  it("returns null when neither source has anything", () => {
    expect(resolveNotes(null, undefined)).toBeNull();
    expect(resolveNotes(null, "")).toBeNull();
  });
});
