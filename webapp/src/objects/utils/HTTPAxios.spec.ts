import { beforeEach, describe, expect, it, vi } from "vitest";

// The stale-bearer fix (#803): a failed token refresh must clear the shared Authorization header
// (a dead bearer 401s even public endpoints, thanks to proactive auth) and tell the player ONCE.
// The fetch mock records every request's headers so the specs assert what actually leaves the app.

export const sentRequests: { url: string; headers: Record<string, string> }[] =
  [];

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: async (
    url: string,
    options?: { headers?: Record<string, string> },
  ) => {
    sentRequests.push({ url, headers: { ...(options?.headers ?? {}) } });
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => "",
    };
  },
}));
vi.mock("@tauri-apps/plugin-log", async () =>
  (await import("@/test/harness/tauri.ts")).logMock(),
);
vi.mock("@/main.ts", async () =>
  (await import("@/test/harness/tauri.ts")).mainMock(),
);
vi.mock("@/objects/stores/LoginStates.ts", async () =>
  (await import("@/test/harness/tauri.ts")).keycloakMock(),
);

import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import { sentAlerts } from "@/test/harness/tauri.ts";

async function lastRequestHeaders(): Promise<Record<string, string>> {
  await new HTTPAxios("public-sessions").get();
  return sentRequests[sentRequests.length - 1].headers;
}

describe("HTTPAxios.updateToken (#803)", () => {
  beforeEach(async () => {
    keycloakStore.keycloak.token = "fresh-token";
    keycloakStore.keycloak.updateToken = async () => true;
    // A successful refresh resets the class's static state (armed header, alert re-enabled), so
    // every test starts from a live session whatever the previous test left behind.
    await HTTPAxios.updateToken();
    sentRequests.length = 0;
    sentAlerts.length = 0;
  });

  it("arms the bearer after a successful refresh", async () => {
    await HTTPAxios.updateToken();
    expect((await lastRequestHeaders()).Authorization).toBe(
      "Bearer fresh-token",
    );
  });

  it("clears the stale bearer when the refresh fails, so requests go out clean", async () => {
    await HTTPAxios.updateToken(); // armed
    keycloakStore.keycloak.updateToken = async () => {
      throw new Error("Linux OIDC session expired");
    };
    await HTTPAxios.updateToken(); // must not reject, must disarm
    expect("Authorization" in (await lastRequestHeaders())).toBe(false);
  });

  it("alerts the player once per expiry, not once per second", async () => {
    keycloakStore.keycloak.updateToken = async () => {
      throw new Error("refresh token expired");
    };
    await HTTPAxios.updateToken();
    await HTTPAxios.updateToken();
    await HTTPAxios.updateToken();
    expect(sentAlerts.length).toBe(1);
    expect(sentAlerts[0].title.length).toBeGreaterThan(0);
  });

  it("re-arms the bearer and the alert after a recovery", async () => {
    keycloakStore.keycloak.updateToken = async () => {
      throw new Error("down");
    };
    await HTTPAxios.updateToken(); // first expiry: one alert
    keycloakStore.keycloak.token = "reborn-token";
    keycloakStore.keycloak.updateToken = async () => true;
    await HTTPAxios.updateToken(); // recovered
    expect((await lastRequestHeaders()).Authorization).toBe(
      "Bearer reborn-token",
    );
    keycloakStore.keycloak.updateToken = async () => {
      throw new Error("down again");
    };
    await HTTPAxios.updateToken(); // second expiry: a second alert is due
    expect(sentAlerts.length).toBe(2);
  });
});
