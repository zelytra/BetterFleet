import {UserStore} from "@/objects/stores/UserStore.ts";
import {WebSocketMessage, WebSocketMessageType} from "@/objects/WebSocet.ts";
import {AlertType} from "@/vue/alert/Alert.ts";
import {alertProvider} from "@/main.ts";
import i18n from "@/objects/i18n";
import {SessionRunner} from "@/objects/SessionRunner.ts";

const {t} = i18n.global;

export interface FleetInterface {
  sessionId: string;
  sessionName: string;
  players: Player[];
  servers: SotServer[];
  status: SessionStatus;
  socket?: WebSocket;
}

export class Fleet {
  public sessionId: string;
  public sessionName: string;
  public players: Player[];
  public servers: SotServer[];
  public status: SessionStatus;
  public socket?: WebSocket;

  constructor() {
    this.sessionId = "";
    this.sessionName = "";
    this.players = [];
    this.servers = [];
    this.status = SessionStatus.WAITING;
  }

  joinSession(sessionId: string) {
    if (this.socket && this.socket.readyState >= 2) {
      this.socket.close();
    }

    UserStore.player.isReady = false;
    UserStore.player.isMaster = false;

    this.socket = new WebSocket(
      import.meta.env.VITE_SOCKET_HOST + "/" + sessionId,
    );

    // Send player data to backend for initialization
    this.socket.onopen = () => {
      if (!this.socket) return;
      const message: WebSocketMessage = {
        data: UserStore.player,
        messageType: WebSocketMessageType.CONNECT,
      };
      this.socket.send(JSON.stringify(message));
    };

    this.socket.onmessage = (ev: MessageEvent<string>) => {
      const message: WebSocketMessage = JSON.parse(ev.data) as WebSocketMessage; //TODO inspect
      switch (message.messageType) {
        case WebSocketMessageType.UPDATE: {
          this.handleFleetUpdate(message.data as FleetInterface);
          break;
        }
        case WebSocketMessageType.RUN_COUNTDOWN: {
          this.handleSessionRunner(message.data as SessionRunner);
          break;
        }
        default: {
          throw new Error(
            "Failed to handle this message type : " + message.messageType,
          );
        }
      }
    };

    this.socket.onerror = () => {
      alertProvider.sendAlert({
        content: t("alert.socket.connectionFailed"),
        title: t("alert.socket.title"),
        type: AlertType.ERROR,
      });
    };
  }

  private handleFleetUpdate(receivedFleet: FleetInterface) {
    this.sessionId = receivedFleet.sessionId;
    this.sessionName = receivedFleet.sessionName;
    this.players = receivedFleet.players;
    this.servers = receivedFleet.servers;
    this.status = receivedFleet.status;
    UserStore.player.sessionId = receivedFleet.sessionId;
    const player: Player = receivedFleet.players.filter(x => x.username == UserStore.player.username)[0]
    UserStore.player.isMaster =player.isMaster;
    UserStore.player.isMaster =player.isReady;
  }

  private handleSessionRunner(countdown:SessionRunner){
    UserStore.player.countDown = countdown
    console.log(countdown)
  }

  leaveSession(): void {
    if (!this.socket) {
      return;
    }
    this.socket.close();
    this.sessionId = "";
  }

  updateToSession() {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: UserStore.player,
      messageType: WebSocketMessageType.UPDATE,
    };
    this.socket.send(JSON.stringify(message));
  }

  runCountDown() {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: UserStore.player.countDown,
      messageType: WebSocketMessageType.START_COUNTDOWN,
    };
    this.socket.send(JSON.stringify(message));
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
  sessionId?: string;
  serverHostName?: string
  countDown?: SessionRunner
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
  CLOSED = "CLOSED", // Game is closed
  STARTED = "STARTED", // Game detected an // Game is in first menu after launch / launching / stopping
  MAIN_MENU = "MAIN_MENU", // In menu to select game mode
  IN_GAME = "IN_GAME", // Status when the remote IP and port was found and player is in game
}

export enum SessionStatus {
  WAITING = "WAITING", // Waiting for player to be ready
  READY = "READY", // All player ready
  COUNTDOWN = "COUNTDOWN", // Countdown to start the click
  ACTION = "ACTION", // Clicking in the game
}
