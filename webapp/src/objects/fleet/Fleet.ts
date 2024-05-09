import {UserStore} from "@/objects/stores/UserStore.ts";
import {WebSocketMessage, WebSocketMessageType} from "@/objects/fleet/WebSocet.ts";
import {AlertType} from "@/vue/alert/Alert.ts";
import {alertProvider} from "@/main.ts";
import {tsi18n} from "@/objects/i18n";
import {ActionPlayer, Player} from "@/objects/fleet/Player.ts";
import {SotServer} from "@/objects/fleet/SotServer.ts";
import {LocalTime} from "@js-joda/core";
import {HTTPAxios} from "@/objects/utils/HTTPAxios.ts";
import {ResponseType} from "@tauri-apps/api/http";

const {t} = tsi18n.global;

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

  async joinSession(sessionId: string) {
    if (this.socket && this.socket.readyState >= 2) {
      this.socket.close();
    }

    UserStore.player.isReady = false;
    UserStore.player.isMaster = false;

    await new HTTPAxios("socket/register", null).get(ResponseType.Text).then((response) => {
      this.socket = new WebSocket(
        UserStore.player.serverHostName + "/" + response.data + "/" + sessionId);
    }).catch(() => {
      alertProvider.sendAlert({
        content: t('alert.websocketAuthFailed.content'),
        title: t('alert.websocketAuthFailed.title'),
        type: AlertType.ERROR
      })
    })

    if (!this.socket) return;

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
          this.handleSessionRunner(message.data as number);
          break;
        }
        case WebSocketMessageType.OUTDATED_CLIENT: {
          alertProvider.sendAlert({
            content: t('alert.outdated.content'),
            title: t('alert.outdated.title'),
            type: AlertType.ERROR
          })
          break
        }
        case WebSocketMessageType.SESSION_NOT_FOUND: {
          alertProvider.sendAlert({
            content: t('alert.sessionNotFound.content'),
            title: t('alert.sessionNotFound.title'),
            type: AlertType.ERROR
          })
          break
        }
        case WebSocketMessageType.CONNECTION_REFUSED: {
          alertProvider.sendAlert({
            content: "REFUSED",
            title: t('alert.sessionNotFound.title'),
            type: AlertType.ERROR
          })
          break
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
      UserStore.player.fleet!.sessionId = "";
      UserStore.player.countDown = undefined; // Reset timer to avoid app freeze
    }
  }

  private handleFleetUpdate(receivedFleet: FleetInterface) {
    this.sessionId = receivedFleet.sessionId;
    this.sessionName = t('session.name.' + receivedFleet.sessionName);
    this.players = receivedFleet.players;
    this.servers = new Map(Object.entries(receivedFleet.servers));
    this.stats = receivedFleet.stats;
    UserStore.player.sessionId = receivedFleet.sessionId;
    const player: Player = receivedFleet.players.filter(x => x.username == UserStore.player.username)[0]
    UserStore.player.isMaster = player.isMaster;
    UserStore.player.isReady = player.isReady;
    UserStore.player.device = player.device;
  }

  private handleSessionRunner(countdown: number) {
    UserStore.player.countDown = {clickTime: LocalTime.now().plusSeconds(countdown)}
  }

  leaveSession(): void {
    if (!this.socket) {
      return;
    }
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

  playerAction(playerToExecute: ActionPlayer, actionType: WebSocketMessageType): void {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: playerToExecute,
      messageType: actionType,
    };
    this.socket.send(JSON.stringify(message));
  }

  runCountDown() {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: null,
      messageType: WebSocketMessageType.START_COUNTDOWN,
    };
    this.socket.send(JSON.stringify(message));
  }

  clearPlayersStatus() {
    if (!this.socket || !UserStore.player.isMaster) return;
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

  sendKeepAlive() {
    if (!this.socket) return;
    const message: WebSocketMessage = {
      data: null,
      messageType: WebSocketMessageType.KEEP_ALIVE,
    };
    this.socket.send(JSON.stringify(message));
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