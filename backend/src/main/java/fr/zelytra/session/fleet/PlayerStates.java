package fr.zelytra.session.fleet;

public enum PlayerStates {
    OFFLINE, // Game not detected
    ONLINE,  // Game detected and open but not in game
    IN_GAME  // Player in a server
}

