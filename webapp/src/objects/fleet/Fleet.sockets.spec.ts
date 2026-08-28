import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("@tauri-apps/plugin-http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@tauri-apps/api/core", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import {
  fakeBackend,
  settle,
  FakeWebSocket,
} from "@/test/harness/FakeBackend.ts";
import { installFakeTransports } from "@/test/harness/tauri.ts";

// The socket lifecycle bugs of #859, proven against the fake backend before being fixed:
// a previous session's still-open socket survived a re-join, and an UPDATE broadcast racing a
// kick blew up the message handler.

describe("Fleet socket lifecycle, against the fake backend", () => {
  beforeEach(() => {
    installFakeTransports();
    UserStore.player.username = "Sailor";
    UserStore.player.serverHostName = "ws://backend/sessions";
    UserStore.player.fleet = new Fleet();
  });

  it("joining a new session closes the previous, still-open socket", async () => {
    const fleet = UserStore.player.fleet as Fleet;
    await fleet.joinSession("");
    await settle();
    const first = fakeBackend.sockets[0];
    expect(first.readyState).toBe(FakeWebSocket.OPEN);

    await fleet.joinSession("");
    await settle();
    // The stale guard read `readyState >= 2` - it closed only sockets that were already
    // CLOSING/CLOSED, so the OPEN one survived with its handlers still wired to the store.
    expect(first.readyState).toBe(FakeWebSocket.CLOSED);
  });

  it("an UPDATE that no longer carries the local player is absorbed, not thrown", async () => {
    const fleet = UserStore.player.fleet as Fleet;
    await fleet.joinSession("");
    await settle();
    const socket = fakeBackend.sockets[fakeBackend.sockets.length - 1];

    // A broadcast racing a kick: the fleet update arrives after the local player left the list
    // but before the departure message. `players.filter(...)[0].isMaster` threw here.
    const withoutMe = JSON.stringify({
      messageType: "UPDATE",
      data: {
        sessionId: "GHOST",
        sessionName: 3,
        isPrivate: true,
        banner: 0,
        players: [
          {
            username: "SomeoneElse",
            isMaster: true,
            isReady: false,
            device: "PC",
            boatSize: 2,
          },
        ],
        servers: {},
        stats: { tryAmount: 0, successPrediction: 0 },
      },
    });
    expect(() => socket.deliver(withoutMe)).not.toThrow();
    // The shared state still applied; only the local player's flags stay as they were,
    // because the departure itself is the kick path's business.
    expect(fleet.players.map((p) => p.username)).toEqual(["SomeoneElse"]);
  });
});
