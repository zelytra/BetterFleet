import { describe, it, expect, vi } from "vitest";

// The module imports the Tauri http and log bridges, which do not exist under vitest.
vi.mock("@tauri-apps/api/http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);

import { simplifyReleaseNotes, whatsNewDecision } from "@/objects/WhatsNew.ts";

// The in-app changelog (#686) must show exactly once per update and never on a fresh install.

describe("whatsNewDecision", () => {
  it("shows when an update changed the version", () => {
    expect(whatsNewDecision("2.1.0", "2.2.0")).toBe("show");
  });

  it("adopts silently on a fresh install", () => {
    expect(whatsNewDecision(null, "2.2.0")).toBe("adopt-silently");
  });

  it("stays quiet when nothing changed or the version is unknown", () => {
    expect(whatsNewDecision("2.2.0", "2.2.0")).toBe("none");
    expect(whatsNewDecision("2.1.0", undefined)).toBe("none");
  });
});

describe("simplifyReleaseNotes", () => {
  it("flattens markdown into short plain lines", () => {
    const lines = simplifyReleaseNotes(
      "## In-game overlay\n\n- **Ready toggle** right in the overlay\n- See the [docs](https://example.com)\n\n",
    );
    expect(lines).toEqual([
      "In-game overlay",
      "- Ready toggle right in the overlay",
      "- See the docs",
    ]);
  });

  it("caps the list so the modal stays a modal", () => {
    const body = Array.from({ length: 40 }, (_, i) => "- line " + i).join("\n");
    expect(simplifyReleaseNotes(body)).toHaveLength(20);
  });
});
