package fr.zelytra.session.socket;

public enum MessageType {
    CONNECT, // When a player join a session
    UPDATE, // When the data of the player need to be broadcast to other player of the session
    START_COUNTDOWN,
    CANCEL_COUNTDOWN
}
