import { describe, expect, it, vi, beforeEach } from "vitest";

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

import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { fakeBackend, settle } from "@/test/harness/FakeBackend.ts";
import { installFakeTransports } from "@/test/harness/tauri.ts";

/** The banner the host actually sent on CONNECT, as the backend saw it. */
function bannerSentOnCreate(): number {
  const created = [...fakeBackend.sessions.values()][0];
  return created.banner;
}

describe("the banner a hosted session gets", () => {
  beforeEach(() => {
    installFakeTransports();
    UserStore.player.username = "Zelytra";
    UserStore.player.serverHostName = "ws://backend/sessions";
    UserStore.player.banner = 0;
    UserStore.player.bannerShuffle = false;
  });

  it("is the template picked in settings", async () => {
    UserStore.player.banner = 2;
    const fleet = new Fleet();

    await fleet.joinSession(""); // empty id = create
    await settle();

    expect(bannerSentOnCreate()).toBe(2);
  });

  it("comes back on the broadcast, so the lobby can render it", async () => {
    UserStore.player.banner = 3;
    const fleet = new Fleet();

    await fleet.joinSession("");
    await settle();

    expect(fleet.banner).toBe(3);
  });

  it("is not the host's when joining someone else's session", async () => {
    // The backend only reads the banner from whoever creates the session; a joiner's preference
    // must not repaint the host's lobby.
    fakeBackend.addSession({ sessionId: "ABC123", banner: 1 });
    UserStore.player.banner = 3;
    const fleet = new Fleet();

    await fleet.joinSession("ABC123");
    await settle();

    expect(fleet.banner).toBe(1);
    expect(fakeBackend.sessions.get("ABC123")!.banner).toBe(1);
  });

  it("does not overwrite the settings pick when shuffling", async () => {
    // Shuffle picks a banner for *this* session. Writing it back would silently replace the
    // template the player chose in Settings — they would find a different one selected there.
    UserStore.player.banner = 1;
    UserStore.player.bannerShuffle = true;
    const fleet = new Fleet();

    await fleet.joinSession("");
    await settle();

    expect(UserStore.player.banner).toBe(1);
    expect(UserStore.player.bannerShuffle).toBe(true);
  });

  it("shuffles onto a real template", async () => {
    UserStore.player.bannerShuffle = true;
    const fleet = new Fleet();

    await fleet.joinSession("");
    await settle();

    const sent = bannerSentOnCreate();
    expect(sent).toBeGreaterThanOrEqual(0);
    expect(sent).toBeLessThan(4);
  });
});
