export interface WebSocketMessage {
  messageType: WebSocketMessageType;
  data: any; // Anytype of data that backend can handle
}

export enum WebSocketMessageType {
  CONNECT = "CONNECT", // When a player join a session
  UPDATE = "UPDATE", // when the data of the player need to be broadcast to other player of the session
  START_COUNTDOWN = "START_COUNTDOWN",
  RUN_COUNTDOWN = "RUN_COUNTDOWN",
  CLEAR_STATUS = "CLEAR_STATUS",
  JOIN_SERVER = "JOIN_SERVER",
  LEAVE_SERVER = "LEAVE_SERVER",
  OUTDATED_CLIENT = "OUTDATED_CLIENT",
  SESSION_NOT_FOUND = "SESSION_NOT_FOUND",
  KEEP_ALIVE = "KEEP_ALIVE",
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  PROMOTE_PLAYER = "PROMOTE_PLAYER",
  KICK_PLAYER = "KICK_PLAYER",
  DEMOTE_PLAYER = "DEMOTE_PLAYER",
}
