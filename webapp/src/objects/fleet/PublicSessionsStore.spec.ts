import { describe, it, expect } from "vitest";
import { applyFilter } from "@/objects/fleet/PublicSessionsFilter.ts";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";

function session(
  name: string,
  isPrivate: boolean,
  playerAmount: number,
): PublicSession {
  return {
    directoryId: "dir-" + name,
    sessionId: isPrivate ? "" : "ABC123", // a private session's code is withheld
    region: "fr",
    admin: ["Zelytra"],
    name,
    playerAmount,
    isPrivate,
    banner: 0,
  };
}

describe("applyFilter", () => {
  const list: PublicSession[] = [
    session("The Foolproof Plan", false, 24),
    session("The Black Tide", true, 8),
    session("The Ghost Corsairs", false, 5),
  ];

  it("returns every session with the 'all' filter", () => {
    expect(applyFilter(list, "all", "")).toHaveLength(3);
  });

  it("keeps only public sessions with the 'public' filter", () => {
    const result = applyFilter(list, "public", "");
    expect(result).toHaveLength(2);
    expect(result.every((s) => !s.isPrivate)).toBe(true);
  });

  it("keeps only private sessions with the 'private' filter", () => {
    expect(applyFilter(list, "private", "").map((s) => s.name)).toEqual([
      "The Black Tide",
    ]);
  });

  it("searches by session name, case-insensitively", () => {
    expect(applyFilter(list, "all", "GHOST").map((s) => s.name)).toEqual([
      "The Ghost Corsairs",
    ]);
  });

  it("combines the filter and the search query", () => {
    // 'the' matches all three names, but the private filter narrows it to one.
    expect(applyFilter(list, "private", "the")).toHaveLength(1);
  });

  it("sorts by player count, busiest first", () => {
    expect(applyFilter(list, "all", "").map((s) => s.playerAmount)).toEqual([
      24, 8, 5,
    ]);
  });
});
