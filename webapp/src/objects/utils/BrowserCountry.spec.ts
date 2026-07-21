import { describe, it, expect } from "vitest";
import { browserCountry } from "@/objects/utils/BrowserCountry.ts";

describe("browserCountry", () => {
  it("uses the region subtag when present", () => {
    expect(browserCountry("en-US")).toBe("us");
    expect(browserCountry("pt-BR")).toBe("br");
    expect(browserCountry("fr-FR")).toBe("fr");
  });

  it("falls back to the language for a bare locale that is also a country", () => {
    expect(browserCountry("fr")).toBe("fr");
    expect(browserCountry("de")).toBe("de");
  });

  it("maps languages whose code is not a country", () => {
    expect(browserCountry("en")).toBe("gb");
    expect(browserCountry("ja")).toBe("jp");
  });

  it("ignores non-region (script) subtags", () => {
    expect(browserCountry("zh-Hans")).toBe("cn");
  });

  it("returns empty for an empty locale", () => {
    expect(browserCountry("")).toBe("");
  });
});
