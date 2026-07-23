import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mount, flushPromises, VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { LocalTime } from "@js-joda/core";

// OverlayView is fed over the Tauri event bus; stub it (and the window/log bridges it pulls in).
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
import OverlayView from "@/components/OverlayView.vue";
import { OverlaySnapshot } from "@/objects/fleet/Overlay.ts";
import { emittedEvents, resetTauriEvents } from "@/test/harness/tauri.ts";
import fr from "@/assets/locales/fr.json";

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  messages: { fr } as any,
});
const WAIT = (fr as any).overlay.empty;
const COUNTDOWN = (fr as any).session.countdown;

let wrapper: VueWrapper | null = null;

function mountOverlay(): VueWrapper {
  wrapper = mount(OverlayView, { global: { plugins: [i18n] } });
  return wrapper;
}

function snapshot(overrides: Partial<OverlaySnapshot> = {}): OverlaySnapshot {
  return {
    locale: "fr",
    inSession: true,
    me: { username: "Me", isReady: false, isSelf: true },
    hotkeyLabel: "Ctrl+Shift+O",
    servers: [],
    unassigned: [],
    countdownEndsAt: null,
    ...overrides,
  };
}

async function feed(snap: OverlaySnapshot) {
  await emit("overlay:update", snap);
  await flushPromises();
}

describe("OverlayView (#671)", () => {
  beforeEach(() => resetTauriEvents(true)); // each mount subscribes fresh
  afterEach(() => {
    wrapper?.unmount(); // clears the countdown interval + the subscription
    wrapper = null;
  });

  it("shows the wait message out of a session", async () => {
    const w = mountOverlay();
    await feed(snapshot({ inSession: false }));
    expect(w.text()).toContain(WAIT);
  });

  it("renders server groupings with their players in a session", async () => {
    const w = mountOverlay();
    await feed(
      snapshot({
        servers: [
          {
            hash: "PIRATE7",
            countryCode: "fr",
            color: "#123456",
            players: [
              { username: "Zelytra", isReady: true, isSelf: true },
              { username: "Sailor", isReady: false, isSelf: false },
            ],
          },
        ],
      }),
    );
    expect(w.text()).toContain("PIRATE7");
    expect(w.text()).toContain("Zelytra");
    expect(w.text()).toContain("Sailor");
    expect(w.text()).not.toContain(WAIT);
  });

  it("keeps serverless players visible, with their status", async () => {
    const w = mountOverlay();
    await feed(
      snapshot({
        servers: [],
        unassigned: [
          { username: "Me", isReady: true, isSelf: true },
          { username: "Waiting", isReady: false, isSelf: false },
        ],
      }),
    );
    expect(w.find(".lobby").exists()).toBe(true);
    expect(w.text()).toContain("Me");
    expect(w.text()).toContain("Waiting");
    // Both rows carry a status badge — the roster is never a bare name list.
    expect(w.findAll(".lobby .status")).toHaveLength(2);
  });

  it("takes over with the countdown while it runs", async () => {
    const w = mountOverlay();
    await feed(
      snapshot({ countdownEndsAt: LocalTime.now().plusSeconds(9).toString() }),
    );
    expect(w.find(".countdown").exists()).toBe(true);
    expect(w.text()).toContain(COUNTDOWN);
  });

  it("relays the local player's ready click to the main window", async () => {
    const w = mountOverlay();
    await feed(
      snapshot({
        servers: [],
        unassigned: [{ username: "Me", isReady: false, isSelf: true }],
      }),
    );
    await w.find(".lobby .self .status").trigger("click");
    expect(emittedEvents.some((e) => e.event === "overlay:toggle-ready")).toBe(
      true,
    );
  });
});
