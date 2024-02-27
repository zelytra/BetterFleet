export class Fleet {
  public sessionId: string;
  public sessionName: string;
  public players: Player[];
  public servers: SotServer[];
  public status: SessionStatus;

  constructor(sessionId: string) {
    this.sessionId = sessionId;
    this.sessionName = "TODO";
    this.players = [];
    this.servers = [];
    this.status = SessionStatus.WAITING;
  }

  joinSession(): void {}

  leaveSession(): void {}

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

  /**
   * @return boolean If the user is connected to the session or not
   */
  public isConnected() {
    return false;
  }
}

export interface Player {
  username: string;
  status: PlayerStates;
  isReady: boolean;
  isMaster: boolean;
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
