import { describe, expect, it } from "vitest";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

// The flag map is 200-odd hand-written lines where a wrong neighbour is invisible in review and
// in the UI - a player just sees the wrong flag next to their region (#859). These assert the
// properties the map must hold rather than every entry.

describe("countryFlags", () => {
  it("serves every flag from the bundled assets", () => {
    // One entry pointed at upload.wikimedia.org, so that flag needed the network at runtime and
    // broke behind a firewall or offline - in an app whose whole point is playing online, but
    // whose asset pipeline is local.
    const remote = [...countryFlags.entries()].filter(
      ([, path]) => !path.startsWith("/flags/"),
    );
    expect(remote).toEqual([]);
  });

  it("never maps a country to a different country's flag", () => {
    // Distinct countries with confusable names: each must own its own asset. Guinea is not
    // Equatorial Guinea; Sudan is not South Sudan.
    expect(countryFlags.get("gn")).toBe("/flags/guinea.svg");
    expect(countryFlags.get("gq")).toBe("/flags/equatorial_guinea.svg");
    expect(countryFlags.get("sd")).toBe("/flags/sudan.svg");
    expect(countryFlags.get("ss")).toBe("/flags/south_sudan.svg");
  });

  it("keys every entry on a two-letter lowercase country code", () => {
    const malformed = [...countryFlags.keys()].filter(
      (code) => !/^[a-z]{2}$/.test(code),
    );
    expect(malformed).toEqual([]);
  });
});
