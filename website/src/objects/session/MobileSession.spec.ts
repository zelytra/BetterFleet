import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  joinLobby,
  leaveLobby,
  lobby,
  toggleReady,
  MobileMessageType,
} from "@/objects/session/MobileSession.ts";

// A minimal stand-in for the browser WebSocket: records sent frames and lets the test drive the
// lifecycle (open / receive / close) by hand.
class FakeWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static last: FakeWebSocket | null = null;

  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: Array<{ messageType: string; data: unknown }> = [];

  constructor(public url: string) {
    FakeWebSocket.last = this;
  }
  send(raw: string) {
    this.sent.push(JSON.parse(raw));
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }
  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

const fleetUpdate = {
  messageType: MobileMessageType.UPDATE,
  data: {
    sessionId: "ABC1234",
    customName: "The Kraken Hunters",
    players: [
      { username: "Bob", isReady: false, isMaster: false, device: "XBOX" },
      { username: "Host", isReady: true, isMaster: true, device: "MICROSOFT" },
    ],
    servers: {
      H1: {
        hash: "H1",
        location: "Paris",
        countryCode: "fr",
        color: "#abc",
        connectedPlayers: [{ username: "Host", isReady: true, isMaster: true }],
      },
    },
  },
};

describe("MobileSession guest client", () => {
  beforeEach(() => {
    FakeWebSocket.last = null;
    (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeWebSocket;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        text: async () => "guest-token",
      })),
    );
  });

  afterEach(() => {
    leaveLobby();
    vi.unstubAllGlobals();
  });

  it("registers as a guest and opens the socket at the bound code", async () => {
    await joinLobby("abc1234", "Bob", "XBOX");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/guest/register?sessionId=ABC1234"),
    );
    expect(FakeWebSocket.last?.url).toContain("/sessions/guest-token/ABC1234");
    expect(lobby.status).toBe("connecting");
  });

  it("sends CONNECT with the console device and no master claim on open", async () => {
    await joinLobby("abc1234", "Bob", "PLAYSTATION");
    FakeWebSocket.last!.open();
    const connect = FakeWebSocket.last!.sent[0];
    expect(connect.messageType).toBe(MobileMessageType.CONNECT);
    expect(connect.data).toMatchObject({
      username: "Bob",
      device: "PLAYSTATION",
      isMaster: false,
      // Carries a status (so the desktop's row doesn't crash on null) and the sessionId (so the
      // backend can route this guest's later UPDATE frames).
      status: "IN_GAME",
      sessionId: "ABC1234",
    });
  });

  it("maps an UPDATE into the reactive lobby (servers object → array)", async () => {
    await joinLobby("abc1234", "Bob", "XBOX");
    FakeWebSocket.last!.open();
    FakeWebSocket.last!.receive(fleetUpdate);
    expect(lobby.status).toBe("connected");
    expect(lobby.sessionName).toBe("The Kraken Hunters");
    expect(lobby.players).toHaveLength(2);
    expect(lobby.servers).toHaveLength(1);
    expect(lobby.servers[0].countryCode).toBe("fr");
  });

  it("toggles ready and pushes the flipped state as an UPDATE", async () => {
    await joinLobby("abc1234", "Bob", "XBOX");
    FakeWebSocket.last!.open();
    toggleReady();
    expect(lobby.isReady).toBe(true);
    const sent = FakeWebSocket.last!.sent;
    const update = sent[sent.length - 1];
    expect(update.messageType).toBe(MobileMessageType.UPDATE);
    expect(update.data).toMatchObject({ username: "Bob", isReady: true });
  });

  it("turns a RUN_COUNTDOWN into an end timestamp", async () => {
    await joinLobby("abc1234", "Bob", "XBOX");
    FakeWebSocket.last!.open();
    const before = Date.now();
    FakeWebSocket.last!.receive({
      messageType: MobileMessageType.RUN_COUNTDOWN,
      data: 5,
    });
    expect(lobby.countdownEndsAt).toBeGreaterThanOrEqual(before + 5000);
  });

  it("surfaces an unknown code as not_found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ status: 404, ok: false, text: async () => "" })),
    );
    await joinLobby("nope123", "Bob", "XBOX");
    expect(lobby.status).toBe("not_found");
    expect(FakeWebSocket.last).toBeNull();
  });
});
