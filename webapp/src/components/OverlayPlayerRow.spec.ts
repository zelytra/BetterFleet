import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import OverlayPlayerRow from "@/components/OverlayPlayerRow.vue";
import { OverlayPlayer } from "@/objects/fleet/Overlay.ts";
import fr from "@/assets/locales/fr.json";

const i18n = createI18n({
  legacy: false,
  locale: "fr",
  messages: { fr } as any,
});
const READY = (fr as any).session.player.ready;
const NOT_READY = (fr as any).session.player.notReady;

function mountRow(player: OverlayPlayer, clickable: boolean) {
  return mount(OverlayPlayerRow, {
    props: { player, clickable },
    global: { plugins: [i18n] },
  });
}

describe("OverlayPlayerRow (#671)", () => {
  it("shows the username and the ready label", () => {
    const w = mountRow(
      { username: "Zelytra", isReady: true, isSelf: true },
      false,
    );
    expect(w.text()).toContain("Zelytra");
    expect(w.text()).toContain(READY);
  });

  it("shows the not-ready label when the player is not ready", () => {
    const w = mountRow(
      { username: "Sailor", isReady: false, isSelf: false },
      false,
    );
    expect(w.text()).toContain(NOT_READY);
  });

  it("emits toggle when its badge is clicked and it is clickable", async () => {
    const w = mountRow({ username: "Me", isReady: false, isSelf: true }, true);
    await w.find(".status").trigger("click");
    expect(w.emitted("toggle")).toHaveLength(1);
  });

  it("stays inert when it is not clickable", async () => {
    const w = mountRow(
      { username: "Other", isReady: false, isSelf: false },
      false,
    );
    await w.find(".status").trigger("click");
    expect(w.emitted("toggle")).toBeUndefined();
  });

  it("renders the badge as a button only when clickable", () => {
    const clickable = mountRow(
      { username: "Me", isReady: false, isSelf: true },
      true,
    );
    const readonly = mountRow(
      { username: "x", isReady: false, isSelf: false },
      false,
    );
    expect(clickable.find("button.status").exists()).toBe(true);
    expect(readonly.find("button.status").exists()).toBe(false);
  });
});
