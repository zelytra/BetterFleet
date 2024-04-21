package fr.zelytra.session.socket;

public enum MessageType {
    CONNECT, // When a player join a session
    UPDATE, // When the data of the player need to be broadcast to other player of the session
    START_COUNTDOWN,
    RUN_COUNTDOWN,
    JOIN_SERVER,
    LEAVE_SERVER,
    CLEAR_STATUS,
    OUTDATED_CLIENT,
    SESSION_NOT_FOUND,
    KEEP_ALIVE,
    CONNECTION_REFUSED,
    PROMOTE_PLAYER,
    KICK_PLAYER,
    DEMOTE_PLAYER,
}
