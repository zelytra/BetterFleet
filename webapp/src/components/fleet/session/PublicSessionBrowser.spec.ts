import { describe, expect, it, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";

// The store reaches for the backend over HTTP and SSE the moment the component
// mounts; neither exists here, so both entry points are stubbed out.
vi.mock("@/objects/utils/HTTPAxios.ts", () => ({
  HTTPAxios: class {
    static updateToken = vi.fn();
    get = vi.fn().mockResolvedValue({ data: { sessions: [] } });
  },
}));
vi.mock("tauri-plugin-log-api", () => ({ info: vi.fn(), error: vi.fn() }));

import PublicSessionBrowser from "@/components/fleet/session/PublicSessionBrowser.vue";
import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";

const i18n = createI18n({
  legacy: false,
  locale: "en",
  messages: {
    en: {
      session: {
        filter: { all: "All", public: "Public", private: "Private" },
        searchPlaceholder: "Search",
        empty: { title: "Nothing here", comment: "No session" },
      },
    },
  },
});

function mountBrowser() {
  return mount(PublicSessionBrowser, {
    global: {
      plugins: [i18n],
      directives: { "click-outside": {} },
      stubs: { SessionRow: true, InputText: true },
    },
  });
}

describe("PublicSessionBrowser filter", () => {
  beforeEach(() => {
    PublicSessionsStore.state.filter = "all";
    vi.spyOn(PublicSessionsStore, "refresh").mockResolvedValue(undefined);
    vi.spyOn(PublicSessionsStore, "connectStream").mockImplementation(() => {});
    vi.spyOn(PublicSessionsStore, "disconnect").mockImplementation(() => {});
  });

  it("starts on 'all'", () => {
    mountBrowser();
    expect(PublicSessionsStore.state.filter).toBe("all");
  });

  // The regression this guards: the dropdown moved its own selection but never
  // told the store, so picking a filter changed the label and nothing else.
  it("pushes the picked filter into the store", async () => {
    const wrapper = mountBrowser();

    await wrapper.find(".filter .input-wrapper").trigger("click");
    const options = wrapper.findAll(".filter .dropdown span");
    const publicOption = options.find((o) => o.text() === "Public");
    await publicOption!.trigger("click");

    expect(PublicSessionsStore.state.filter).toBe("public");
  });

  it("shows the pick in the closed input", async () => {
    const wrapper = mountBrowser();

    await wrapper.find(".filter .input-wrapper").trigger("click");
    const options = wrapper.findAll(".filter .dropdown span");
    await options.find((o) => o.text() === "Public")!.trigger("click");

    expect(wrapper.find(".filter .input-wrapper").text()).toBe("Public");
  });

  it("pushes 'private' too", async () => {
    const wrapper = mountBrowser();

    await wrapper.find(".filter .input-wrapper").trigger("click");
    const options = wrapper.findAll(".filter .dropdown span");
    const privateOption = options.find((o) => o.text() === "Private");
    await privateOption!.trigger("click");

    expect(PublicSessionsStore.state.filter).toBe("private");
  });
});
