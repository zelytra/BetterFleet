export class Fleet {

    public readonly sessionId: string
    public players: Player[]
    public masters: Player[]
    public servers: SotServer[]

    constructor(sessionId: string) {
        this.sessionId = sessionId;
        this.players = [];
        this.masters = [];
        this.servers = [];
    }

    joinSession(): void {

    }

    leaveSession(): void {

    }
}

export interface Player {
    username: string
    status: PlayerStates
    isReady: boolean
}

export interface SotServer {
    ip: string
    port: number
    location: string
    connectedPlayers: Player[]
}

export enum PlayerStates {
    OFFLINE, // Game not detected
    ONLINE, // Game detected and open but not in game
    IN_GAME, // Player in a server
}