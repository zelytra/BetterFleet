import {UserStore} from "@/objects/stores/UserStore.ts";

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

    joinSession(sessionId: string): void {
        if (this.socket) {
            this.socket.close();
        }

        UserStore.player.isReady = false;
        UserStore.player.isMaster= false;

        this.socket = new WebSocket(
            import.meta.env.VITE_SOCKET_HOST + "/" + sessionId,
        );

        // Send player data to backend for initialization
        this.socket.onopen = () => {
            if (!this.socket) return;
            this.socket.send(JSON.stringify(UserStore.player));
        };

        this.socket.onmessage = (ev: MessageEvent<string>) => {
            const receivedFleet: FleetInterface = JSON.parse(ev.data) as FleetInterface //TODO inspect
            this.sessionId = receivedFleet.sessionId;
            this.sessionName = receivedFleet.sessionName;
            this.players = receivedFleet.players;
            this.servers = receivedFleet.servers;
            this.status = receivedFleet.status;

            UserStore.player.sessionId = receivedFleet.sessionId;
        };
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
        this.socket.send(JSON.stringify(UserStore.player));
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
    sessionId?:string
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
    OFFLINE = "OFFLINE", // Game not detected
    ONLINE = "ONLINE", // Game detected and open but not in game
    IN_GAME = "IN_GAME", // Player in a server
}

export enum SessionStatus {
    WAITING = "WAITING", // Waiting for player to be ready
    READY = "READY", // All player ready
    COUNTDOWN = "COUNTDOWN", // Countdown to start the click
    ACTION = "ACTION", // Clicking in the game
}
