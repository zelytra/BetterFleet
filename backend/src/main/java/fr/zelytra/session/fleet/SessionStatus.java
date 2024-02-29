package fr.zelytra.session.fleet;

public enum SessionStatus {
    WAITING,  // Waiting for player to be ready
    READY,    // All player ready
    COUNTDOWN,// Countdown to start the click
    ACTION    // Clicking in the game
}
