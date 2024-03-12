export interface WebSocketMessage {
    messageType: WebSocketMessageType;
    data: any; // Anytype of data that backend can handle
}

export enum WebSocketMessageType {
    CONNECT = "CONNECT", // When a player join a session
    UPDATE = "UPDATE", // when the data of the player need to be broadcast to other player of the session
    START_COUNTDOWN = "START_COUNTDOWN",
    RUN_COUNTDOWN = "RUN_COUNTDOWN",
    CANCEL_COUNTDOWN = "CANCEL_COUNTDOWN",
    CLEAR_STATUS = "CLEAR_STATUS",
    JOIN_SERVER = "JOIN_SERVER",
    LEAVE_SERVER = "LEAVE_SERVER",
}
