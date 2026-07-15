import { describe, it, expect } from "vitest";
import {
  ContributorProvider,
  ContributorType,
} from "@/objects/fleet/Contributor.ts";

describe("ContributorProvider.getPlayerContrib", () => {
  it("resolves each contributor role", () => {
    expect(ContributorProvider.getPlayerContrib("Zelytra")).toBe(
      ContributorType.DEVELOPER,
    );
    expect(ContributorProvider.getPlayerContrib("Ichabodt")).toBe(
      ContributorType.TRANSLATOR,
    );
    expect(ContributorProvider.getPlayerContrib("ZeTro")).toBe(
      ContributorType.DESIGNER,
    );
    expect(ContributorProvider.getPlayerContrib("Vex")).toBe(
      ContributorType.ALPHA_TESTER,
    );
  });

  it("matches usernames case-insensitively", () => {
    expect(ContributorProvider.getPlayerContrib("zElYtRa")).toBe(
      ContributorType.DEVELOPER,
    );
  });

  it("returns null for an unknown username", () => {
    expect(
      ContributorProvider.getPlayerContrib("some-random-pirate"),
    ).toBeNull();
  });
});
