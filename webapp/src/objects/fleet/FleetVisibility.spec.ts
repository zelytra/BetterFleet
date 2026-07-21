import { describe, expect, it, vi, beforeEach } from "vitest";

// Fleet drags in the Tauri runtime and the app's alert provider through its
// imports; neither exists under vitest, so they are stubbed down to what these
// tests touch.
vi.mock("tauri-plugin-log-api", () => ({ info: vi.fn(), error: vi.fn() }));
vi.mock("@tauri-apps/api/http", () => ({
  ResponseType: { JSON: 1 },
  fetch: vi.fn(),
}));
vi.mock("@/main.ts", () => ({ alertProvider: { sendAlert: vi.fn() } }));
vi.mock("@/objects/utils/HTTPAxios.ts", () => ({
  HTTPAxios: class {
    static updateToken = vi.fn();
  },
}));

import { Fleet, FleetInterface } from "@/objects/fleet/Fleet.ts";
import { WebSocketMessageType } from "@/objects/fleet/WebSocet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";

function fleetWithSocket(): { fleet: Fleet; sent: string[] } {
  const fleet = new Fleet();
  const sent: string[] = [];
  fleet.socket = {
    send: (data: string): void => {
      sent.push(data);
    },
  } as unknown as WebSocket;
  return { fleet, sent };
}

function update(over: Partial<FleetInterface> = {}): FleetInterface {
  return {
    sessionId: "ABC123",
    sessionName: "0",
    isPrivate: true,
    players: [{ username: "Zelytra", isMaster: true, isReady: false } as any],
    servers: new Map(),
    stats: { tryAmount: 0, successPrediction: 0 },
    ...over,
  } as FleetInterface;
}

describe("Fleet visibility", () => {
  beforeEach(() => {
    UserStore.player.username = "Zelytra";
  });

  it("starts private, matching the backend default", () => {
    expect(new Fleet().isPrivate).toBe(true);
  });

  it("sends SET_VISIBILITY with the requested state", () => {
    const { fleet, sent } = fleetWithSocket();

    fleet.setVisibility(false);

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({
      messageType: WebSocketMessageType.SET_VISIBILITY,
      data: false,
    });
  });

  it("does not change the local state — the backend decides and broadcasts", () => {
    const { fleet } = fleetWithSocket();

    fleet.setVisibility(false);

    // Still private: only the UPDATE broadcast may flip it, so a non-master whose
    // message the backend drops never sees a phantom "public".
    expect(fleet.isPrivate).toBe(true);
  });

  it("adopts the visibility carried by an UPDATE broadcast", () => {
    const { fleet } = fleetWithSocket();

    (fleet as any).handleFleetUpdate(update({ isPrivate: false }));
    expect(fleet.isPrivate).toBe(false);

    (fleet as any).handleFleetUpdate(update({ isPrivate: true }));
    expect(fleet.isPrivate).toBe(true);
  });

  it("stays quiet when there is no socket", () => {
    const fleet = new Fleet();
    expect(() => fleet.setVisibility(false)).not.toThrow();
  });
});
