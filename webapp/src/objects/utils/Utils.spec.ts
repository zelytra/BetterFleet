import { describe, it, expect } from "vitest";
import { Utils } from "@/objects/utils/Utils.ts";
import { PlayerStates } from "@/objects/fleet/Player.ts";

describe("Utils.parseRustPlayerStatus", () => {
  it("maps the statuses reported by the Rust layer, case-insensitively", () => {
    expect(Utils.parseRustPlayerStatus("closed")).toBe(PlayerStates.CLOSED);
    expect(Utils.parseRustPlayerStatus("STARTED")).toBe(PlayerStates.STARTED);
    expect(Utils.parseRustPlayerStatus("MainMenu")).toBe(
      PlayerStates.MAIN_MENU,
    );
    expect(Utils.parseRustPlayerStatus("ingame")).toBe(PlayerStates.IN_GAME);
  });

  it("falls back to CLOSED for an unknown status", () => {
    expect(Utils.parseRustPlayerStatus("garbage")).toBe(PlayerStates.CLOSED);
  });
});

describe("Utils.generateRandomColor", () => {
  it("returns a hex color with the 50% opacity suffix", () => {
    expect(Utils.generateRandomColor()).toMatch(/^#[0-9a-f]{6}80$/);
  });
});
