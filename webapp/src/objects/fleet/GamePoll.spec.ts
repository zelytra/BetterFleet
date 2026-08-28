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

import { pollGameTick } from "@/objects/fleet/GamePoll.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { PlayerStates } from "@/objects/fleet/Player.ts";
import { rustResponses } from "@/test/harness/tauri.ts";
import { installFakeTransports } from "@/test/harness/tauri.ts";

describe("the 400ms game poll tick", () => {
  beforeEach(() => {
    installFakeTransports();
    UserStore.player.username = "Sailor";
    UserStore.player.fleet = new Fleet();
    UserStore.player.status = PlayerStates.CLOSED;
  });

  it("feeds the store from the Rust game object", async () => {
    rustResponses.set("get_game_object", {
      status: "MainMenu",
      ip: "",
      port: 0,
      noUdpCycles: 0,
      captureHealth: "ok",
    });
    await pollGameTick();
    expect(UserStore.player.status).toBe(PlayerStates.MAIN_MENU);
  });

  it("absorbs an IPC failure instead of leaking an unhandled rejection", async () => {
    // The interval calls this fire-and-forget 2.5 times a second; a rejection here is an
    // unhandled rejection in production (#859). The tick must resolve regardless.
    rustResponses.set(
      "get_game_object",
      Promise.reject(new Error("IPC briefly unavailable")),
    );
    await expect(pollGameTick()).resolves.toBeUndefined();
  });
});
