import { describe, it, expect, vi } from "vitest";

// The module pulls UserStore -> main.ts and the Tauri bridges; the harness stand-ins cut that.
vi.mock("@tauri-apps/api/tauri", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@tauri-apps/api/http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { buildPresence } from "@/objects/fleet/PresenceSync.ts";
import { Player } from "@/objects/fleet/Player.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { LocalTime } from "@js-joda/core";

// What lands on a Discord profile (#684) is governed here: never a private code, nothing when the
// player opted out or sits outside a session.

function player(overrides: Partial<Player> = {}): Player {
  return { username: "Me", isReady: false, ...overrides } as Player;
}

function fleet(
  sessionId: string,
  isPrivate: boolean,
  members: { isReady: boolean }[],
): Fleet {
  const result = new Fleet();
  result.sessionId = sessionId;
  result.isPrivate = isPrivate;
  result.players = members.map(
    (member, index) =>
      ({ username: "p" + index, isReady: member.isReady }) as Player,
  );
  return result;
}

describe("buildPresence", () => {
  it("shows the lobby state with ready counts for a public session", () => {
    const p = player({
      fleet: fleet("abc123", false, [
        { isReady: true },
        { isReady: true },
        { isReady: false },
      ]),
    });
    expect(buildPresence(p, 1_700_000)).toEqual({
      state: "Lobby — 2/3 ready",
      details: "Session ABC123",
      startEpoch: 1_700_000,
    });
  });

  it("never exposes a private session's code", () => {
    const p = player({ fleet: fleet("secret", true, [{ isReady: false }]) });
    expect(buildPresence(p, null)?.details).toBe("Private session");
  });

  it("switches to the countdown state while one runs", () => {
    const p = player({
      fleet: fleet("abc123", false, [{ isReady: true }]),
      countDown: { clickTime: LocalTime.of(12, 0) },
    });
    expect(buildPresence(p, null)?.state).toBe("Countdown — raising anchors!");
  });

  it("yields nothing outside a session or when the player opted out", () => {
    expect(buildPresence(player({ fleet: undefined }), null)).toBeNull();
    const noId = player({ fleet: fleet("", true, []) });
    expect(buildPresence(noId, null)).toBeNull();
    const optedOut = player({
      richPresence: false,
      fleet: fleet("abc123", false, [{ isReady: true }]),
    });
    expect(buildPresence(optedOut, null)).toBeNull();
  });
});
