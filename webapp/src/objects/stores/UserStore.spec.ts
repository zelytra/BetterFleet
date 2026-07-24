import { describe, it, expect, beforeEach, vi } from "vitest";

// UserStore pulls in the whole app chain (Fleet → HTTPAxios, i18n, Keycloak). Mock the Tauri edges
// so the store can init under vitest. Unlike the shared mainMock (whose i18n is undefined), init()
// assigns i18n.global.locale.value, so this stub gives it a real-ish i18n.
vi.mock("@tauri-apps/api/window", async () =>
  (await import("@/test/harness/tauri.ts")).windowMock(),
);
vi.mock("@tauri-apps/api/event", async () =>
  (await import("@/test/harness/tauri.ts")).eventMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@/main.ts", () => ({
  alertProvider: { sendAlert: () => {} },
  i18n: { global: { locale: { value: "en" } } },
}));
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import {
  BoatSize,
  Player,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";

// The values a brand-new player carries before touching any setting — what App.vue feeds init().
const DEFAULTS: Player = {
  username: "",
  status: PlayerStates.CLOSED,
  isReady: false,
  isMaster: false,
  device: PlayerDevice.MICROSOFT,
  boatSize: BoatSize.NONE,
  soundEnable: true,
  soundLevel: 30,
  macroEnable: true,
  banner: 0,
  bannerShuffle: false,
  shareStats: true,
};

// Every persisted preference, each set to a NON-default value: if the save→restart round-trip drops
// or resets any one of them, the loop below fails on exactly that key. Covers the whole Preferences
// surface plus the device/boat/host settings that also live in localStorage.
const CUSTOM = {
  lang: "es",
  country: "jp",
  device: PlayerDevice.PLAYSTATION,
  boatSize: BoatSize.GALLEON,
  soundEnable: false,
  soundLevel: 77,
  macroEnable: false,
  banner: 2,
  bannerShuffle: true,
  shareStats: false,
  richPresence: false,
  recapCard: false,
  overlayHotkey: "Alt+Shift+P",
  serverHostName: "wss://custom.example/api/sessions",
} as const;

describe("UserStore preference persistence", () => {
  beforeEach(() => localStorage.clear());

  it("restores every preference after a restart", () => {
    UserStore.init({ ...DEFAULTS });
    Object.assign(UserStore.player, CUSTOM);

    // The exact save the app runs in window.onbeforeunload (FleetMenuNavigator.vue).
    localStorage.setItem(LocalKey.USER_STORE, JSON.stringify(UserStore.player));

    // A restart: a fresh init reads the saved blob back over the defaults.
    UserStore.init({ ...DEFAULTS });

    const player = UserStore.player as Record<string, unknown>;
    for (const [key, value] of Object.entries(CUSTOM)) {
      expect(player[key], `preference "${key}" was not persisted`).toBe(value);
    }
  });

  it("keeps the opt-out booleans off once turned off", () => {
    // These three go through `x !== undefined ? x : true`, so a naive `x || true` regression would
    // silently flip them back on. Pin the false case specifically.
    UserStore.init({ ...DEFAULTS });
    UserStore.player.soundEnable = false;
    UserStore.player.macroEnable = false;
    UserStore.player.shareStats = false;
    localStorage.setItem(LocalKey.USER_STORE, JSON.stringify(UserStore.player));

    UserStore.init({ ...DEFAULTS });

    expect(UserStore.player.soundEnable).toBe(false);
    expect(UserStore.player.macroEnable).toBe(false);
    expect(UserStore.player.shareStats).toBe(false);
  });

  it("falls back to defaults on a fresh install", () => {
    UserStore.init({ ...DEFAULTS });

    expect(UserStore.player.soundEnable).toBe(true);
    expect(UserStore.player.macroEnable).toBe(true);
    expect(UserStore.player.shareStats).toBe(true);
    expect(UserStore.player.soundLevel).toBe(30);
    expect(UserStore.player.banner).toBe(0);
    expect(UserStore.player.bannerShuffle).toBe(false);
    expect(UserStore.player.device).toBe(PlayerDevice.MICROSOFT);
    expect(UserStore.player.boatSize).toBe(BoatSize.NONE);
  });
});
