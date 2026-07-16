/**
 * An in-memory stand-in for the BetterFleet backend, so the frontend can be driven end to end
 * without a server, a database or the Tauri runtime.
 *
 * It mirrors the real contract rather than the frontend's assumptions about it — that is the whole
 * point: it answers what SessionSocket/SessionDirectoryEndpoints answer, including the refusals.
 * If a test passes here and fails in production, this file is what should be corrected.
 *
 * Covers:
 *  - REST  GET /public-sessions            -> PublicSessionsSnapshot
 *  - SSE   GET /public-sessions/stream     -> a snapshot per directory change
 *  - REST  GET /socket/register            -> a socket token
 *  - WS    /sessions/{token}/{sessionId}   -> CONNECT / UPDATE / RENAME_SESSION / SET_VISIBILITY,
 *                                             SESSION_NOT_FOUND and CONNECTION_REFUSED
 */

export interface FakePlayer {
  username: string;
  isMaster: boolean;
  isReady: boolean;
  status?: string;
  device?: string;
  boatSize?: string;
}

export interface FakeSession {
  sessionId: string;
  directoryId: string;
  sessionName: number; // the pirate-name seed the client localizes
  customName: string | null;
  isPrivate: boolean;
  banner: number;
  region: string;
  players: FakePlayer[];
  servers: Record<string, unknown>;
  stats: { tryAmount: number; successPrediction: number };
}

const MAX_NAME_LENGTH = 40; // SessionNameFilter.MAX_LENGTH
const BLOCKED = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "dick",
  "slut",
  "whore",
];

export class FakeBackend {
  sessions = new Map<string, FakeSession>();
  sockets: FakeWebSocket[] = [];
  streams: FakeEventSource[] = [];
  /** Every REST path requested, so tests can assert what the client actually called. */
  requests: string[] = [];
  private nextId = 1;

  reset(): void {
    this.sessions.clear();
    this.sockets = [];
    this.streams = [];
    this.requests = [];
    this.nextId = 1;
  }

  // ---------------------------------------------------------------- fixtures

  addSession(over: Partial<FakeSession> = {}): FakeSession {
    const id = this.nextId++;
    const session: FakeSession = {
      sessionId: over.sessionId ?? "SESS" + id,
      directoryId: over.directoryId ?? "dir-" + id,
      sessionName: over.sessionName ?? 7,
      customName: over.customName ?? null,
      isPrivate: over.isPrivate ?? false,
      banner: over.banner ?? 0,
      region: over.region ?? "fr",
      players: over.players ?? [
        { username: "Host", isMaster: true, isReady: false },
      ],
      servers: over.servers ?? {},
      stats: over.stats ?? { tryAmount: 0, successPrediction: 0 },
    };
    this.sessions.set(session.sessionId, session);
    this.publishDirectoryChange();
    return session;
  }

  // ---------------------------------------------------------------- directory

  /**
   * What SessionManager.toPublicSession builds. Private sessions are listed — the browser shows
   * them with a closed padlock — but their code is withheld, so they can only be joined by someone
   * who was given it.
   */
  private toPublicSession(session: FakeSession) {
    const name =
      session.customName && session.customName.trim().length > 0
        ? session.customName
        : String(session.sessionName);
    return {
      directoryId: session.directoryId,
      sessionId: session.isPrivate ? "" : session.sessionId,
      region: session.region,
      admin: session.players.filter((p) => p.isMaster).map((p) => p.username),
      name,
      playerAmount: session.players.length,
      isPrivate: session.isPrivate,
      banner: session.banner,
    };
  }

  snapshot() {
    const sessions = [...this.sessions.values()];
    return {
      sessions: sessions.map((s) => this.toPublicSession(s)),
      connectedPlayers: sessions.reduce(
        (total, s) => total + s.players.length,
        0,
      ),
    };
  }

  publishDirectoryChange(): void {
    const frame = JSON.stringify(this.snapshot());
    this.streams.forEach((stream) => stream.push(frame));
  }

  // ---------------------------------------------------------------- REST

  fetch = async (
    url: string,
    options?: { responseType?: unknown },
  ): Promise<{ data: unknown }> => {
    this.requests.push(url);
    if (url.endsWith("/public-sessions")) {
      return { data: this.snapshot() };
    }
    if (url.endsWith("/socket/register")) {
      return { data: "socket-token" };
    }
    void options;
    throw new Error("FakeBackend: unhandled REST path " + url);
  };

  // ---------------------------------------------------------------- sockets

  private broadcast(session: FakeSession): void {
    const payload = JSON.stringify({ messageType: "UPDATE", data: session });
    this.sockets
      .filter(
        (socket) =>
          socket.sessionId === session.sessionId && socket.readyState === 1,
      )
      .forEach((socket) => socket.deliver(payload));
  }

  openSocket(socket: FakeWebSocket): void {
    this.sockets.push(socket);
  }

  /** The server side of SessionSocket.onMessage. */
  handleMessage(socket: FakeWebSocket, raw: string): void {
    const message = JSON.parse(raw);
    const session = this.sessions.get(socket.sessionId);

    switch (message.messageType) {
      case "CONNECT": {
        const username = message.data?.username;
        if (socket.sessionId === "") {
          // Empty id = create, which is what the Create session button sends.
          const created = this.addSession({
            players: [{ username, isMaster: true, isReady: false }],
            isPrivate: true, // private by default
          });
          socket.sessionId = created.sessionId;
          socket.username = username;
          this.broadcast(created);
          return;
        }
        if (!session) {
          socket.deliver(
            JSON.stringify({ messageType: "SESSION_NOT_FOUND", data: null }),
          );
          socket.close();
          return;
        }
        // SessionManager.joinSession: the same account already in this very session, on a live
        // socket, is a duplicate and is refused rather than tearing the fleet down.
        const existing = session.players.find((p) => p.username === username);
        const liveSocket = this.sockets.find(
          (s) =>
            s !== socket &&
            s.sessionId === session.sessionId &&
            s.username === username &&
            s.readyState === 1,
        );
        if (existing && liveSocket) {
          socket.deliver(
            JSON.stringify({ messageType: "CONNECTION_REFUSED", data: null }),
          );
          socket.close();
          return;
        }
        socket.username = username;
        if (!existing) {
          session.players.push({ username, isMaster: false, isReady: false });
        }
        this.broadcast(session);
        this.publishDirectoryChange();
        return;
      }
      case "SET_VISIBILITY": {
        if (!session || !this.isMaster(session, socket)) return;
        session.isPrivate = Boolean(message.data);
        this.broadcast(session);
        this.publishDirectoryChange();
        return;
      }
      case "RENAME_SESSION": {
        if (!session || !this.isMaster(session, socket)) return;
        const cleaned = String(message.data ?? "")
          .trim()
          .slice(0, MAX_NAME_LENGTH);
        if (cleaned.length === 0) {
          session.customName = null; // back to the default pirate name
        } else if (
          BLOCKED.some((word) => cleaned.toLowerCase().includes(word))
        ) {
          return; // rejected: no broadcast, nothing changes
        } else {
          session.customName = cleaned;
        }
        this.broadcast(session);
        this.publishDirectoryChange();
        return;
      }
      case "UPDATE": {
        if (!session) return;
        const player = session.players.find(
          (p) => p.username === socket.username,
        );
        if (player) Object.assign(player, message.data);
        this.broadcast(session);
        return;
      }
      case "KEEP_ALIVE":
        return;
      default:
        return;
    }
  }

  private isMaster(session: FakeSession, socket: FakeWebSocket): boolean {
    return session.players.some(
      (p) => p.username === socket.username && p.isMaster,
    );
  }
}

export const fakeBackend = new FakeBackend();

// ------------------------------------------------------------------ fake transports

export class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = 0;
  sessionId = "";
  username = "";
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    // ws://host/sessions/{token}/{sessionId}
    this.sessionId = url.substring(url.lastIndexOf("/") + 1);
    fakeBackend.openSocket(this);
    // A real socket opens over the network, i.e. never before the caller has finished assigning
    // its handlers. A microtask here fires onopen inside the same await chain that creates the
    // socket, so the client's onopen is still null and the CONNECT is silently lost — a race the
    // product does not have. setTimeout puts the open in a later task, like the real thing.
    setTimeout(() => {
      this.readyState = 1;
      this.onopen?.();
    }, 0);
  }

  send(data: string): void {
    this.sent.push(data);
    fakeBackend.handleMessage(this, data);
  }

  deliver(data: string): void {
    this.onmessage?.({ data });
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
}

export class FakeEventSource {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;

  constructor(public url: string) {
    fakeBackend.streams.push(this);
  }

  push(data: string): void {
    if (!this.closed) this.onmessage?.({ data });
  }

  close(): void {
    this.closed = true;
    fakeBackend.streams = fakeBackend.streams.filter((s) => s !== this);
  }
}

/** Lets pending microtasks (socket open, broadcast, Vue's reactivity) settle. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
