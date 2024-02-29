import { UserStore } from "@/objects/stores/UserStore.ts";

export class Fleet {
  public sessionId: string;
  public sessionName: string;
  public players: Player[];
  public servers: SotServer[];
  public status: SessionStatus;
  public socket?: WebSocket;

  constructor() {
    this.sessionId = "";
    this.sessionName = "TODO";
    this.players = [];
    this.servers = [];
    this.status = SessionStatus.WAITING;
  }

  joinSession(sessionId: string): void {
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new WebSocket(
      import.meta.env.VITE_SOCKET_HOST + "/" + sessionId,
    );
    this.socket.onopen = () => {
      if (!this.socket) return;
      this.socket.send(JSON.stringify(UserStore.player));
    };
  }

  leaveSession(): void {
    if (!this.socket) {
      return;
    }
    this.socket.close();
  }

  getReadyPlayers(): Player[] {
    return this.players.filter((player) => player.isReady);
  }

  public static getFormatedStatus(player: Player) {
    return player.status.toString().toLowerCase().replace("_", "-");
  }

  /**
   * @return List of the players with the right master
   */
  public getMasters(): Player[] {
    return this.players.filter((player) => player.isMaster);
  }
}

export interface Player extends Preferences {
  username: string;
  status: PlayerStates;
  isReady: boolean;
  isMaster: boolean;
  fleet?: Fleet;
}

export interface Preferences {
  lang?: string;
}

export interface SotServer {
  ip: string;
  port: number;
  location: string;
  connectedPlayers: Player[];
}

export enum PlayerStates {
  OFFLINE, // Game not detected
  ONLINE, // Game detected and open but not in game
  IN_GAME, // Player in a server
}

export enum SessionStatus {
  WAITING, // Waiting for player to be ready
  READY, // All player ready
  COUNTDOWN, // Countdown to start the click
  ACTION, // Clicking in the game
}
