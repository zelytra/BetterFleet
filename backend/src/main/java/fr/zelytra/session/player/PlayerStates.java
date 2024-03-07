package fr.zelytra.session.player;

public enum PlayerStates {
    CLOSED, // Game is closed
    STARTED, // Game detected an // Game is in first menu after launch / launching / stopping
    MAIN_MENU, // In menu to select game mode
    IN_GAME, // Status when the remote IP and port was found and player is in game
}

