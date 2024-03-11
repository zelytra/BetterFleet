import {UserStore} from "@/objects/stores/UserStore.ts";
import {WebSocketMessage, WebSocketMessageType} from "@/objects/WebSocet.ts";
import {AlertType} from "@/vue/alert/Alert.ts";
import {alertProvider} from "@/main.ts";
import i18n from "@/objects/i18n";
import {SessionRunner} from "@/objects/SessionRunner.ts";
import {Player} from "@/objects/Player.ts";
import {SotServer} from "@/objects/SotServer.ts";

const {t} = i18n.global;

export interface FleetStatistics {
  tryAmount: number
  successPrediction: number
}

export interface FleetInterface {
  sessionId: string;
  sessionName: string;
  players: Player[];
  servers: Map<string, SotServer>;
  socket?: WebSocket;
  stats: FleetStatistics
}

export class Fleet {
  public sessionId: string;
  public sessionName: string;
  public players: Player[];
  public servers: Map<string, SotServer>;
  public socket?: WebSocket;
  private safeClose: boolean = false;
  public stats: FleetStatistics

  constructor() {
    this.sessionId = "";
    this.sessionName = "";
    this.players = [];
    this.servers = new Map<string, SotServer>();
    this.stats = {
      tryAmount: 0,
      successPrediction: 0,
    }
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

      // If player already connect to a server
      if (UserStore.player.server) {
        this.joinServer()
      }
    };

    this.socket.onmessage = (ev: MessageEvent<string>) => {
      const message: WebSocketMessage = JSON.parse(ev.data) as WebSocketMessage;
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

    this.socket.onclose = () => {
      if (!this.safeClose) {
        alertProvider.sendAlert({
          content: t("alert.socket.random"),
          title: t("alert.socket.title"),
          type: AlertType.ERROR,
        });
        UserStore.player.fleet!.sessionId = "";
        UserStore.player.countDown = undefined; // Reset timer to avoid app freeze
      }
      this.safeClose = false;
    }
  }

  private handleFleetUpdate(receivedFleet: FleetInterface) {
    this.sessionId = receivedFleet.sessionId;
    this.sessionName = receivedFleet.sessionName;
    this.players = receivedFleet.players;
    this.servers = new Map(Object.entries(receivedFleet.servers));
    this.stats = receivedFleet.stats;
    UserStore.player.sessionId = receivedFleet.sessionId;
    const player: Player = receivedFleet.players.filter(x => x.username == UserStore.player.username)[0]
    UserStore.player.isMaster = player.isMaster;
    UserStore.player.isReady = player.isReady;
  }

  private handleSessionRunner(countdown: SessionRunner) {
    UserStore.player.countDown = countdown

  }

  leaveSession(): void {
    if (!this.socket) {
      return;
    }
    this.safeClose = true;
    this.socket.close();
    this.sessionId = "";
  }

  updateToSession(): void {
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

  clearPlayersStatus() {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: undefined,
      messageType: WebSocketMessageType.CLEAR_STATUS,
    };
    this.socket.send(JSON.stringify(message));
  }

  joinServer(): void {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: UserStore.player.server,
      messageType: WebSocketMessageType.JOIN_SERVER,
    };
    this.socket.send(JSON.stringify(message));
  }

  leaveServer(): void {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: UserStore.player.server,
      messageType: WebSocketMessageType.LEAVE_SERVER,
    };
    this.socket.send(JSON.stringify(message));
    UserStore.player.server = undefined;
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




