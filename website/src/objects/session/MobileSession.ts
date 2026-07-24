import { reactive } from "vue";

// Guest session client for console players joining a lobby from their phone (issue #682). The
// website is a separate package from the desktop app, so the wire protocol is re-declared here rather
// than imported. It mirrors the backend JSR-356 socket at `/sessions/{token}/{sessionId}`: a guest
// token is minted by the unauthenticated `/guest/register?sessionId=CODE` (the code is the
// credential), then the socket carries `{ messageType, data }` JSON frames.

export enum MobileMessageType {
  CONNECT = "CONNECT",
  UPDATE = "UPDATE",
  RUN_COUNTDOWN = "RUN_COUNTDOWN",
  OUTDATED_CLIENT = "OUTDATED_CLIENT",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  KEEP_ALIVE = "KEEP_ALIVE",
}

export type ConsoleDevice = "XBOX" | "PLAYSTATION";

export interface LobbyPlayer {
  username: string;
  isReady: boolean;
  isMaster: boolean;
  device?: string;
}

export interface LobbyServer {
  hash: string;
  location: string;
  countryCode?: string;
  color: string;
  connectedPlayers: LobbyPlayer[];
}

/** The backend `FleetInterface` DTO carried by an UPDATE frame (only the fields the phone renders). */
interface FleetPayload {
  sessionId: string;
  customName: string | null;
  players: LobbyPlayer[];
  servers: Record<string, LobbyServer>;
}

export type LobbyStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "not_found"
  | "refused"
  | "error"
  | "closed";

// Every message resets the socket's 30s idle timeout; a quiet lobby sends none, so ping under that.
const KEEP_ALIVE_MS = 20_000;

/** The single live lobby a phone shows. Reactive so the component tracks it. */
export const lobby = reactive({
  status: "idle" as LobbyStatus,
  code: "",
  sessionName: "",
  me: "",
  isReady: false,
  players: [] as LobbyPlayer[],
  servers: [] as LobbyServer[],
  /** Epoch ms when the synchronized "set sail" fires, or null when no countdown is running. */
  countdownEndsAt: null as number | null,
});

let socket: WebSocket | null = null;
let keepAlive: ReturnType<typeof setInterval> | null = null;
let countdownReset: ReturnType<typeof setTimeout> | null = null;
let device: ConsoleDevice = "XBOX";

const restBase = (): string =>
  (import.meta.env.VITE_BACKEND_HOST as string) || "/api";

/** Derives the ws(s):// origin from the REST base — relative in dev (proxied), absolute in prod. */
function socketBase(): string {
  const raw = restBase();
  try {
    const url = new URL(raw, window.location.origin);
    const proto = url.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + url.host + url.pathname.replace(/\/$/, "");
  } catch {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return proto + "//" + window.location.host + "/api";
  }
}

function mePayload() {
  // The console guest never hosts: isMaster stays false (the backend also forces it) and no
  // clientVersion is sent (the guest path skips the desktop version allowlist).
  return {
    username: lobby.me,
    device,
    isReady: lobby.isReady,
    isMaster: false,
    // A console player is in the game on their console — the desktop reads this as their status
    // (without it the app's status render blows up on a null). sessionId routes their UPDATE frames:
    // the backend finds the fleet by the sessionId in the payload, not the socket.
    status: "IN_GAME",
    sessionId: lobby.code,
  };
}

function send(messageType: MobileMessageType, data: unknown): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ messageType, data }));
  }
}

function applyUpdate(fleet: FleetPayload): void {
  lobby.sessionName = fleet.customName?.trim() || lobby.code;
  lobby.players = fleet.players ?? [];
  lobby.servers = Object.values(fleet.servers ?? {});
  const self = lobby.players.find((p) => p.username === lobby.me);
  if (self) lobby.isReady = self.isReady;
}

/** Joins the session identified by `code` as a console guest, or reflects why it couldn't. */
export async function joinLobby(
  code: string,
  username: string,
  consoleDevice: ConsoleDevice,
): Promise<void> {
  leaveLobby();
  lobby.code = code.trim().toUpperCase();
  lobby.me = username.trim();
  lobby.isReady = false;
  device = consoleDevice;
  lobby.status = "connecting";

  let token: string;
  try {
    const response = await fetch(
      restBase() +
        "/guest/register?sessionId=" +
        encodeURIComponent(lobby.code),
    );
    if (response.status === 404) {
      lobby.status = "not_found";
      return;
    }
    if (!response.ok) {
      lobby.status = "error";
      return;
    }
    token = (await response.text()).trim();
  } catch {
    lobby.status = "error";
    return;
  }

  // Backend endpoint is /sessions/{token}/{sessionId}; socketBase() is the /api origin, so the
  // /sessions segment must be added or the upgrade hits a route that doesn't exist.
  socket = new WebSocket(
    socketBase() + "/sessions/" + token + "/" + lobby.code,
  );

  socket.onopen = () => {
    send(MobileMessageType.CONNECT, mePayload());
    keepAlive = setInterval(
      () => send(MobileMessageType.KEEP_ALIVE, null),
      KEEP_ALIVE_MS,
    );
  };

  socket.onmessage = (event: MessageEvent<string>) => {
    const message = JSON.parse(event.data) as {
      messageType: MobileMessageType;
      data: unknown;
    };
    switch (message.messageType) {
      case MobileMessageType.UPDATE:
        lobby.status = "connected";
        applyUpdate(message.data as FleetPayload);
        break;
      case MobileMessageType.RUN_COUNTDOWN: {
        const seconds = message.data as number;
        lobby.countdownEndsAt = Date.now() + seconds * 1000;
        // Return to the lobby a few seconds after "set sail" instead of freezing on the countdown.
        if (countdownReset) clearTimeout(countdownReset);
        countdownReset = setTimeout(
          () => (lobby.countdownEndsAt = null),
          (seconds + 4) * 1000,
        );
        break;
      }
      case MobileMessageType.SESSION_NOT_FOUND:
        lobby.status = "not_found";
        break;
      case MobileMessageType.CONNECTION_REFUSED:
        lobby.status = "refused";
        break;
      case MobileMessageType.OUTDATED_CLIENT:
        lobby.status = "error";
        break;
      default:
        break;
    }
  };

  socket.onerror = () => {
    if (lobby.status === "connecting") lobby.status = "error";
  };

  socket.onclose = () => {
    if (keepAlive) clearInterval(keepAlive);
    keepAlive = null;
    if (countdownReset) clearTimeout(countdownReset);
    countdownReset = null;
    lobby.countdownEndsAt = null;
    // A close after a clean session is "closed" (the app crew left, so the backend disbanded it, or
    // the link dropped); a close mid-connect is the failure already set.
    if (lobby.status === "connected") lobby.status = "closed";
  };
}

/** Flips the local player's ready state and pushes it to the fleet. */
export function toggleReady(): void {
  lobby.isReady = !lobby.isReady;
  send(MobileMessageType.UPDATE, mePayload());
}

/** Closes the socket and clears the lobby. */
export function leaveLobby(): void {
  if (keepAlive) clearInterval(keepAlive);
  keepAlive = null;
  if (countdownReset) clearTimeout(countdownReset);
  countdownReset = null;
  if (socket) {
    socket.onclose = null;
    if (socket.readyState <= WebSocket.OPEN) socket.close();
    socket = null;
  }
  lobby.status = "idle";
  lobby.players = [];
  lobby.servers = [];
  lobby.countdownEndsAt = null;
}
