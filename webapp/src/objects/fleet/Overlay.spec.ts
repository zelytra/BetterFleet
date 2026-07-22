import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from "vitest";
import { LocalTime } from "@js-joda/core";

// The overlay lives on the Tauri event bus and the Tauri window API; neither exists under vitest.
vi.mock("@tauri-apps/api/window", async () =>
  (await import("@/test/harness/tauri.ts")).windowMock(),
);
vi.mock("@tauri-apps/api/event", async () =>
  (await import("@/test/harness/tauri.ts")).eventMock(),
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

import { emit } from "@tauri-apps/api/event";
import {
  computeSnapshot,
  isOverlayWindow,
  onOverlayUpdate,
  requestToggleReady,
  setOverlayVisible,
  isOverlayVisible,
  startOverlayBroadcaster,
} from "@/objects/fleet/Overlay.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import {
  BoatSize,
  Player,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";
import { SotServer } from "@/objects/fleet/SotServer.ts";
import {
  emittedEvents,
  fakeOverlayWindow,
  resetTauriEvents,
  setCurrentWindowLabel,
} from "@/test/harness/tauri.ts";

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    username: "Me",
    status: PlayerStates.IN_GAME,
    isReady: false,
    isMaster: false,
    device: PlayerDevice.MICROSOFT,
    boatSize: BoatSize.SLOOP,
    soundEnable: true,
    soundLevel: 30,
    macroEnable: false,
    banner: 0,
    bannerShuffle: false,
    shareStats: true,
    lang: "fr",
    ...overrides,
  };
}

function server(
  partial: Partial<SotServer> & { connectedPlayers: Player[] },
): SotServer {
  return {
    ip: "1.2.3.4",
    port: 30000,
    location: "",
    hash: "HASH",
    color: "#123456",
    ...partial,
  };
}

function fleetWith(
  servers: Record<string, SotServer> = {},
  sessionId = "SID",
): Fleet {
  const fleet = new Fleet();
  fleet.sessionId = sessionId;
  for (const [key, value] of Object.entries(servers)) {
    fleet.servers.set(key, value);
  }
  return fleet;
}

describe("Overlay snapshot + bridge (#671)", () => {
  beforeAll(async () => {
    // Suppress the broadcaster's 1s interval (we drive the bus by hand); its listeners stay registered.
    vi.useFakeTimers();
    await startOverlayBroadcaster();
  });
  afterAll(() => vi.useRealTimers());

  beforeEach(() => {
    resetTauriEvents(); // clears emitted events + window state, keeps the broadcaster's listeners
    UserStore.player = makePlayer({ fleet: fleetWith() });
  });

  describe("computeSnapshot", () => {
    it("carries the local player as `me` and the active locale", () => {
      UserStore.player = makePlayer({
        username: "Zelytra",
        isReady: true,
        lang: "en",
        fleet: fleetWith(),
      });
      const snap = computeSnapshot();
      expect(snap.me).toEqual({
        username: "Zelytra",
        isReady: true,
        isSelf: true,
      });
      expect(snap.locale).toBe("en");
    });

    it("falls back to `en` when the player has no language", () => {
      UserStore.player = makePlayer({ lang: undefined, fleet: fleetWith() });
      expect(computeSnapshot().locale).toBe("en");
    });

    it("reads inSession from the fleet's session id", () => {
      UserStore.player = makePlayer({ fleet: fleetWith({}, "SID") });
      expect(computeSnapshot().inSession).toBe(true);
      UserStore.player = makePlayer({ fleet: fleetWith({}, "") });
      expect(computeSnapshot().inSession).toBe(false);
    });

    it("keeps only populated servers, biggest grouping first", () => {
      const fleet = fleetWith({
        small: server({ hash: "SMALL", connectedPlayers: [makePlayer()] }),
        big: server({
          hash: "BIG",
          connectedPlayers: [
            makePlayer({ username: "a" }),
            makePlayer({ username: "b" }),
            makePlayer({ username: "c" }),
          ],
        }),
        empty: server({ hash: "EMPTY", connectedPlayers: [] }),
      });
      UserStore.player = makePlayer({ fleet });
      expect(computeSnapshot().servers.map((s) => s.hash)).toEqual([
        "BIG",
        "SMALL",
      ]);
    });

    it("marks the local player and lowercases the region code", () => {
      const fleet = fleetWith({
        s: server({
          countryCode: "FR",
          connectedPlayers: [
            makePlayer({ username: "Other", isReady: false }),
            makePlayer({ username: "Me", isReady: true }),
          ],
        }),
      });
      UserStore.player = makePlayer({ username: "Me", fleet });
      const group = computeSnapshot().servers[0];
      expect(group.countryCode).toBe("fr");
      const me = group.players.find((p) => p.username === "Me")!;
      const other = group.players.find((p) => p.username === "Other")!;
      expect(me.isSelf).toBe(true);
      expect(me.isReady).toBe(true);
      expect(other.isSelf).toBe(false);
    });

    it("lists session players held by no server as unassigned, self first", () => {
      const onServer = makePlayer({ username: "OnServer" });
      const fleet = fleetWith({
        s: server({ connectedPlayers: [onServer] }),
      });
      fleet.players = [
        onServer,
        makePlayer({ username: "Waiting", isReady: false }),
        makePlayer({ username: "Me", isReady: true }),
      ];
      UserStore.player = makePlayer({ username: "Me", fleet });

      const snap = computeSnapshot();

      // OnServer sits in their grouping, not here; the local player leads the leftovers.
      expect(snap.unassigned.map((p) => p.username)).toEqual(["Me", "Waiting"]);
      expect(snap.unassigned[0]).toEqual({
        username: "Me",
        isReady: true,
        isSelf: true,
      });
    });

    it("still yields `me` with no servers when out of a session", () => {
      UserStore.player = makePlayer({ username: "Me", fleet: undefined });
      const snap = computeSnapshot();
      expect(snap.inSession).toBe(false);
      expect(snap.servers).toEqual([]);
      expect(snap.me.username).toBe("Me");
    });

    it("surfaces the countdown end time as an ISO string, or null", () => {
      UserStore.player = makePlayer({
        fleet: fleetWith(),
        countDown: undefined,
      });
      expect(computeSnapshot().countdownEndsAt).toBeNull();

      UserStore.player = makePlayer({
        fleet: fleetWith(),
        countDown: { clickTime: LocalTime.of(12, 34, 56) },
      });
      expect(computeSnapshot().countdownEndsAt).toBe("12:34:56");
    });
  });

  describe("ready toggle bridge", () => {
    it("flips ready and pushes to the session when the overlay asks", () => {
      const pushed = vi
        .spyOn(Fleet.prototype, "updateToSession")
        .mockImplementation(() => {});
      UserStore.player = makePlayer({ isReady: false, fleet: fleetWith() });

      requestToggleReady();

      expect(UserStore.player.isReady).toBe(true);
      expect(pushed).toHaveBeenCalledOnce();
      // The main window echoes a fresh snapshot so the overlay reflects it immediately.
      expect(emittedEvents.some((e) => e.event === "overlay:update")).toBe(
        true,
      );
      pushed.mockRestore();
    });
  });

  describe("subscription", () => {
    it("asks for the current state on subscribe and forwards updates", async () => {
      UserStore.player = makePlayer({ fleet: fleetWith() });
      const received: unknown[] = [];
      const unlisten = await onOverlayUpdate((s) => received.push(s));

      expect(emittedEvents.some((e) => e.event === "overlay:request")).toBe(
        true,
      );

      await emit("overlay:update", { sentinel: true });
      expect(received[received.length - 1]).toEqual({ sentinel: true });

      unlisten();
    });
  });

  describe("window helpers", () => {
    it("detects the overlay window from its label", () => {
      setCurrentWindowLabel("overlay");
      expect(isOverlayWindow()).toBe(true);
      setCurrentWindowLabel("main");
      expect(isOverlayWindow()).toBe(false);
    });

    it("shows and hides the overlay window", async () => {
      await setOverlayVisible(true);
      expect(fakeOverlayWindow.visible).toBe(true);
      expect(await isOverlayVisible()).toBe(true);

      await setOverlayVisible(false);
      expect(fakeOverlayWindow.visible).toBe(false);
      expect(await isOverlayVisible()).toBe(false);
    });
  });
});
