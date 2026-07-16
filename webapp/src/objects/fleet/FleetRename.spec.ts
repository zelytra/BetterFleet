import { describe, expect, it, vi, beforeEach } from "vitest";

// Fleet drags in the Tauri runtime and the app's alert provider through its imports;
// neither exists under vitest.
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
import fr from "@/assets/locales/fr.json";

// Fleet localizes through the standalone tsi18n instance, whose locale is "fr" — so the
// default name for a seed is whatever fr.json says, not a string worth hardcoding here.
const DEFAULT_NAME_FOR_SEED_7 = (fr as any).session.name["7"];

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
    sessionName: "7", // the pirate-name seed
    customName: null,
    isPrivate: true,
    players: [{ username: "Zelytra", isMaster: true, isReady: false } as any],
    servers: new Map(),
    stats: { tryAmount: 0, successPrediction: 0 },
    ...over,
  } as FleetInterface;
}

describe("Fleet renaming", () => {
  beforeEach(() => {
    UserStore.player.username = "Zelytra";
  });

  it("sends RENAME_SESSION with the requested name", () => {
    const { fleet, sent } = fleetWithSocket();

    fleet.renameSession("Alliance des Pirates");

    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0])).toEqual({
      messageType: WebSocketMessageType.RENAME_SESSION,
      data: "Alliance des Pirates",
    });
  });

  it("does not rename locally — the backend filters, then broadcasts", () => {
    const { fleet } = fleetWithSocket();
    (fleet as any).handleFleetUpdate(update({ customName: "Before" }));

    fleet.renameSession("Something The Filter Might Reject");

    // Still the old name: a rejected rename must not flash on the master's screen.
    expect(fleet.sessionName).toBe("Before");
    expect(fleet.customName).toBe("Before");
  });

  it("shows the custom name once the broadcast carries one", () => {
    const { fleet } = fleetWithSocket();

    (fleet as any).handleFleetUpdate(
      update({ customName: "Alliance des Pirates" }),
    );

    expect(fleet.sessionName).toBe("Alliance des Pirates");
    expect(fleet.customName).toBe("Alliance des Pirates");
  });

  it("falls back to the localized pirate name when there is no custom one", () => {
    const { fleet } = fleetWithSocket();

    (fleet as any).handleFleetUpdate(update({ customName: null }));

    expect(fleet.sessionName).toBe(DEFAULT_NAME_FOR_SEED_7);
    expect(fleet.customName).toBe("");
  });

  it("reverts to the default name when the custom one is cleared", () => {
    const { fleet } = fleetWithSocket();
    (fleet as any).handleFleetUpdate(
      update({ customName: "Alliance des Pirates" }),
    );

    // Clearing it server-side comes back as a blank customName.
    (fleet as any).handleFleetUpdate(update({ customName: "" }));

    expect(fleet.customName).toBe("");
    expect(fleet.sessionName).toBe(DEFAULT_NAME_FOR_SEED_7);
  });

  it("stays quiet when there is no socket", () => {
    const fleet = new Fleet();
    expect(() => fleet.renameSession("Nope")).not.toThrow();
  });
});
