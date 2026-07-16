import { describe, expect, it } from "vitest";
import { boatIcon } from "@/objects/fleet/BoatIcons.ts";
import { BoatSize } from "@/objects/fleet/Player.ts";

describe("boatIcon", () => {
  it("draws each ship differently", () => {
    // The point of the feature. A copy-paste that pointed two sizes at one file would break nothing
    // visible — the icon would just quietly stop meaning anything.
    const ships = [BoatSize.SLOOP, BoatSize.BRIGANTINE, BoatSize.GALLEON].map(
      boatIcon,
    );
    expect(new Set(ships).size).toBe(3);
  });

  it("gives every size an icon", () => {
    for (const size of Object.values(BoatSize)) {
      expect(boatIcon(size), `${size} has no icon`).toBeTruthy();
    }
  });

  it("keeps the generic hull for a size nobody picked", () => {
    expect(boatIcon(BoatSize.NONE)).toBe(boatIcon("something else entirely"));
  });

  it("falls back rather than handing a render undefined", () => {
    // boatSize arrives from the backend and out of localStorage, so a render can be asked for a value
    // this build has never heard of. Indexing blind would put a broken-image glyph in the fleet list.
    for (const junk of [undefined, null, "", "sloop", "GALLEON ", 4, {}, []]) {
      expect(
        boatIcon(junk),
        `${JSON.stringify(junk)} resolved to nothing`,
      ).toBeTruthy();
    }
  });
});
