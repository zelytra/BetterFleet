import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

vi.mock("@tauri-apps/api/http", async () =>
  (await import("@/test/harness/tauri.ts")).httpMock(),
);
vi.mock("tauri-plugin-log-api", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@tauri-apps/api/tauri", async () =>
  (await import("@/test/harness/tauri.ts")).invokeMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import PublicFleetSessions from "@/components/fleet/session/PublicFleetSessions.vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";
import { fakeBackend, settle } from "@/test/harness/FakeBackend.ts";
import { installFakeTransports, sentAlerts } from "@/test/harness/tauri.ts";
import fr from "@/assets/locales/fr.json";

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  messages: { fr } as any,
});

// The names the player actually reads for seeds 7 and 12.
const NAME_7 = (fr as any).session.name["7"];
const NAME_12 = (fr as any).session.name["12"];

function mountBrowser() {
  const session = new Fleet();
  UserStore.player.fleet = session;
  const wrapper = mount(PublicFleetSessions, {
    props: { session },
    global: {
      plugins: [i18n],
      directives: { "click-outside": {} },
      stubs: {
        // Stubbed for the teleport and the backdrop, not for the gate: the real one is
        // `v-if="isModalOpen"`, so a stub that renders its slot unconditionally puts the modal's
        // text on screen at all times and quietly makes "is the modal open?" unassertable.
        ModalTemplate: {
          props: { isModalOpen: Boolean },
          template: `<div v-if="isModalOpen" class="modal"><slot /></div>`,
        },
      },
    },
  });
  return { wrapper, session };
}

/** The way in for a code: the Join panel on the right. Nothing in the modal exists before this. */
async function openCodeModal(wrapper: any) {
  await wrapper.find(".session.join").trigger("click");
  await wrapper.vm.$nextTick();
}

async function search(wrapper: any, text: string) {
  const input = wrapper.find(".search input");
  await input.setValue(text);
  await settle();
}

describe("public sessions browser, against a fake backend", () => {
  beforeEach(() => {
    installFakeTransports();
    PublicSessionsStore.state.sessions = [];
    PublicSessionsStore.state.filter = "all";
    PublicSessionsStore.state.query = "";
    UserStore.player.username = "Sailor";
    UserStore.player.serverHostName = "ws://backend/sessions";
  });

  it("lists what the backend sends", async () => {
    fakeBackend.addSession({
      sessionId: "AAA111",
      customName: "The Foolproof Plan",
    });
    const { wrapper } = mountBrowser();
    await settle();

    expect(wrapper.findAll(".session-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("The Foolproof Plan");
  });

  it("lists private sessions too, marked as private", async () => {
    fakeBackend.addSession({
      sessionId: "PUB",
      customName: "Open Crew",
      isPrivate: false,
    });
    fakeBackend.addSession({
      sessionId: "PRIV",
      customName: "Closed Crew",
      isPrivate: true,
    });
    const { wrapper } = mountBrowser();
    await settle();

    expect(wrapper.text()).toContain("Closed Crew");
    expect(wrapper.findAll(".session-row")).toHaveLength(2);
  });

  it("joins a public session when its row is clicked", async () => {
    fakeBackend.addSession({
      sessionId: "AAA111",
      customName: "The Foolproof Plan",
    });
    const { wrapper, session } = mountBrowser();
    await settle();

    await wrapper.find(".session-row").trigger("click");
    await settle();

    expect(session.sessionId).toBe("AAA111");
    expect(
      fakeBackend.sessions.get("AAA111")!.players.map((p) => p.username),
    ).toContain("Sailor");
  });

  it("asks for the code when a private row is clicked", async () => {
    fakeBackend.addSession({
      sessionId: "PRIV",
      customName: "Closed Crew",
      isPrivate: true,
    });
    const { wrapper } = mountBrowser();
    await settle();

    expect(wrapper.text()).not.toContain(fr.session.choice.modal.title);
    await wrapper.find(".session-row").trigger("click");
    await settle();

    // The row is the natural gesture — you can see the session you want. It stayed inert instead, and
    // the way in was a separate button elsewhere on the screen.
    expect(wrapper.text()).toContain(fr.session.choice.modal.title);
  });

  it("never creates a session from a private row", async () => {
    fakeBackend.addSession({
      sessionId: "PRIV",
      customName: "Closed Crew",
      isPrivate: true,
    });
    const before = fakeBackend.sessions.size;
    const { wrapper, session } = mountBrowser();
    await settle();

    await wrapper.find(".session-row").trigger("click");
    await settle();

    // The backend withholds a private session's code, so the row holds "". Joining "" is how a
    // session gets *created* — clicking one private row would have opened a brand new session and
    // dropped the player into it.
    expect(fakeBackend.sessions.size).toBe(before);
    expect(session.sessionId).toBeFalsy();
  });

  it("joins the private session once the host's code is typed in", async () => {
    fakeBackend.addSession({
      sessionId: "PRIV",
      customName: "Closed Crew",
      isPrivate: true,
    });
    const { wrapper, session } = mountBrowser();
    await settle();

    await wrapper.find(".session-row").trigger("click");
    await settle();
    await wrapper.find(".username-wrapper input").setValue("PRIV");
    await wrapper.find(".big-button").trigger("click");
    await settle();

    expect(session.sessionId).toBe("PRIV");
    expect(
      fakeBackend.sessions.get("PRIV")!.players.map((p) => p.username),
    ).toContain("Sailor");
  });

  it("joins by code", async () => {
    fakeBackend.addSession({ sessionId: "42B69X", customName: "By Code" });
    const { wrapper, session } = mountBrowser();
    await settle();

    await openCodeModal(wrapper);
    await wrapper.find(".username-wrapper input").setValue("42B69X");
    await wrapper.find(".big-button").trigger("click");
    await settle();

    expect(session.sessionId).toBe("42B69X");
  });

  it("searches on the name the player actually reads, not the seed", async () => {
    // A default-named session carries a numeric seed; the browser shows the localized pirate name.
    fakeBackend.addSession({
      sessionId: "AAA111",
      sessionName: 7,
      customName: null,
    });
    fakeBackend.addSession({
      sessionId: "BBB222",
      sessionName: 12,
      customName: null,
    });
    const { wrapper } = mountBrowser();
    await settle();
    expect(wrapper.findAll(".session-row")).toHaveLength(2);

    await search(wrapper, NAME_7.slice(0, 6));

    expect(wrapper.findAll(".session-row")).toHaveLength(1);
    expect(wrapper.text()).toContain(NAME_7);
    expect(wrapper.text()).not.toContain(NAME_12);
  });

  it("searches custom names too", async () => {
    fakeBackend.addSession({
      sessionId: "AAA111",
      customName: "The Ghost Corsairs",
    });
    fakeBackend.addSession({
      sessionId: "BBB222",
      customName: "The Black Tide",
    });
    const { wrapper } = mountBrowser();
    await settle();

    await search(wrapper, "ghost");

    expect(wrapper.findAll(".session-row")).toHaveLength(1);
    expect(wrapper.text()).toContain("The Ghost Corsairs");
  });

  it("does not join a private session on click — its code is withheld", async () => {
    fakeBackend.addSession({
      sessionId: "PRIV",
      customName: "Closed Crew",
      isPrivate: true,
    });
    const { wrapper, session } = mountBrowser();
    await settle();

    await wrapper.find(".session-row").trigger("click");
    await settle();

    // An empty id is how a session gets *created*, so a private row must not emit at all.
    expect(session.sessionId).toBe("");
    expect(fakeBackend.sessions.size).toBe(1);
  });

  it("explains a refused join instead of putting REFUSED on screen", async () => {
    // The backend refuses exactly one thing: this account is already in this session on a live
    // socket — the "je me fais refused" of a second window.
    fakeBackend.addSession({
      sessionId: "42B69X",
      customName: "Busy",
      players: [{ username: "Sailor", isMaster: true, isReady: false }],
    });
    const { wrapper } = mountBrowser();
    await settle();
    // A first client is already connected as Sailor.
    const firstSession = new Fleet();
    await firstSession.joinSession("42B69X");
    await settle();

    await openCodeModal(wrapper);
    await wrapper.find(".username-wrapper input").setValue("42B69X");
    await wrapper.find(".big-button").trigger("click");
    await settle();

    expect(sentAlerts.map((a) => a.content)).not.toContain("REFUSED");
    const last = sentAlerts[sentAlerts.length - 1];
    expect(last?.content).toContain("session");
  });

  it("still picks up new sessions when the SSE never delivers", async () => {
    // The reported symptom: "the list only updates when I press Refresh". The stream leaves the
    // app through the webview while everything else goes through Tauri's Rust HTTP plugin, so it
    // can fail on its own. Kill it here and the list must still come alive.
    vi.useFakeTimers();
    try {
      const { wrapper } = mountBrowser();
      await vi.advanceTimersByTimeAsync(0);
      fakeBackend.streams.forEach((s) => s.close()); // the stream is dead; nothing will be pushed

      fakeBackend.addSession({
        sessionId: "NEW",
        customName: "Appeared Later",
      });
      await vi.advanceTimersByTimeAsync(6000); // one poll tick

      expect(wrapper.text()).toContain("Appeared Later");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the list live when a session flips to private over SSE", async () => {
    const session = fakeBackend.addSession({
      sessionId: "AAA111",
      customName: "Open Crew",
      isPrivate: false,
    });
    const { wrapper } = mountBrowser();
    await settle();
    expect(wrapper.find(".session-row .lock").attributes("alt")).toBe("public");

    // The master flips it; the backend pushes a fresh snapshot.
    session.isPrivate = true;
    fakeBackend.publishDirectoryChange();
    await settle();

    expect(wrapper.findAll(".session-row")).toHaveLength(1);
    expect(wrapper.find(".session-row .lock").attributes("alt")).toBe(
      "private",
    );
  });
});
