import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { LocalTime } from "@js-joda/core";

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

import SessionCountdown from "@/components/fleet/session/SessionCountdown.vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import {
  BoatSize,
  Player,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";
import { installFakeTransports, rustCalls } from "@/test/harness/tauri.ts";
import fr from "@/assets/locales/fr.json";

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  messages: { fr } as any,
});

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    username: "Me",
    status: PlayerStates.MAIN_MENU,
    isReady: true,
    isMaster: false,
    device: PlayerDevice.MICROSOFT,
    boatSize: BoatSize.SLOOP,
    soundEnable: true,
    soundLevel: 60,
    macroEnable: false,
    banner: 0,
    bannerShuffle: false,
    shareStats: true,
    ...overrides,
  };
}

let wrapper: VueWrapper | null = null;

function mountCountdown(): VueWrapper {
  wrapper = mount(SessionCountdown, {
    props: { session: new Fleet() },
    global: {
      plugins: [i18n],
      provide: { alertProvider: { sendAlert: () => {} } },
    },
  });
  return wrapper;
}

function soundCalls() {
  return rustCalls.filter((c) => c.command === "play_countdown_sound");
}

// The countdown sound went through the webview's Audio element and stayed silent whenever the app
// sat occluded behind the game (webview audio is suspended). It is played natively by Rust now —
// these lock the bridge so it can't quietly fall back.
describe("SessionCountdown native sound (#671)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeTransports();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
  });

  it("asks Rust to play the jingle, at the player's volume", async () => {
    UserStore.player = makePlayer({
      soundLevel: 60,
      countDown: { clickTime: LocalTime.now().plusSeconds(10) },
    });
    mountCountdown();

    await vi.advanceTimersByTimeAsync(300);

    expect(soundCalls().length).toBeGreaterThan(0);
    expect(soundCalls()[0].args).toEqual({ volume: 0.6 });
  });

  it("throttles the poke instead of spamming Rust every 5ms tick", async () => {
    UserStore.player = makePlayer({
      countDown: { clickTime: LocalTime.now().plusSeconds(10) },
    });
    mountCountdown();

    await vi.advanceTimersByTimeAsync(1000);

    // 5ms ticks would mean ~200 calls; the 250ms throttle keeps it to a handful.
    expect(soundCalls().length).toBeGreaterThan(1);
    expect(soundCalls().length).toBeLessThanOrEqual(6);
  });

  it("stays silent when the player disabled sound", async () => {
    UserStore.player = makePlayer({
      soundEnable: false,
      countDown: { clickTime: LocalTime.now().plusSeconds(10) },
    });
    mountCountdown();

    await vi.advanceTimersByTimeAsync(600);

    expect(soundCalls()).toHaveLength(0);
  });
});
