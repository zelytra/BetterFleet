import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { LocalTime } from "@js-joda/core";

vi.mock("@tauri-apps/api/core", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@tauri-apps/plugin-http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("@tauri-apps/plugin-log", async () =>
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
import {
  installFakeTransports,
  rustCalls,
  rustResponses,
} from "@/test/harness/tauri.ts";
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
/** What the component told the player, so a test can assert the copy and not just the call. */
const alerts: { title: string; content: string }[] = [];

function mountCountdown(): VueWrapper {
  wrapper = mount(SessionCountdown, {
    props: { session: new Fleet() },
    global: {
      plugins: [i18n],
      provide: {
        alertProvider: {
          sendAlert: (alert: { title: string; content: string }) =>
            void alerts.push(alert),
        },
      },
    },
  });
  return wrapper;
}

function soundCalls() {
  return rustCalls.filter((c) => c.command === "play_countdown_sound");
}

// The countdown sound went through the webview's Audio element and stayed silent whenever the app
// sat occluded behind the game (webview audio is suspended). It is played natively by Rust now:
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

// The set-sail click used to be fire-and-forget: its result was discarded, its failures only
// reached a console a release build does not have, and the player was told nothing (#815). These
// pin the reporting - the click itself is Rust's, and no test can inject one.
describe("SessionCountdown set-sail click (#815)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    installFakeTransports();
    alerts.length = 0;
    rustResponses.clear();
    // The click is gated on !isLinux(), which reads the user agent - and the test environment's
    // says Linux. Answer as WebView2 does, since this whole path is the Windows one.
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/120.0.0.0",
    });
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    rustResponses.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function runCountdownToClick() {
    UserStore.player = makePlayer({
      status: PlayerStates.MAIN_MENU,
      isReady: true,
      macroEnable: true,
      soundEnable: false,
      countDown: { clickTime: LocalTime.now().plusNanos(1) },
    });
    mountCountdown();
    return vi.advanceTimersByTimeAsync(200);
  }

  function clickCalls() {
    return rustCalls.filter((c) => c.command === "rise_anchor");
  }

  it("asks Rust for the click when the macro is on", async () => {
    rustResponses.set("rise_anchor", "clicked");
    await runCountdownToClick();
    expect(clickCalls()).toHaveLength(1);
  });

  it("says nothing when the click landed", async () => {
    rustResponses.set("rise_anchor", "clicked");
    await runCountdownToClick();
    expect(alerts).toHaveLength(0);
  });

  it("tells the player to click themselves when the injection was refused", async () => {
    // The UIPI signature, and the one de-elevating the GUI (#732) could introduce.
    rustResponses.set("rise_anchor", "injection-rejected");
    await runCountdownToClick();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].title).toBe(fr.alert.macro.title);
    expect(alerts[0].content).toBe(fr.alert.macro.content);
  });

  it("reports every failing stage, not just one", async () => {
    for (const outcome of ["game-not-found", "focus-refused", "failed"]) {
      alerts.length = 0;
      rustResponses.set("rise_anchor", outcome);
      await runCountdownToClick();
      expect(alerts, outcome).toHaveLength(1);
      wrapper?.unmount();
      wrapper = null;
    }
  });

  it("blames nothing and nobody", async () => {
    // House rule: copy never accuses a VPN, an optimiser or an anti-cheat - the cause is a
    // hypothesis, and the player can only act on "click it yourself".
    const copy = (
      fr.alert.macro.title +
      " " +
      fr.alert.macro.content
    ).toLowerCase();
    for (const word of [
      "vpn",
      "antivirus",
      "anti-cheat",
      "anticheat",
      "pare-feu",
    ]) {
      expect(copy).not.toContain(word);
    }
  });
});
