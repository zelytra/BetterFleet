package fr.zelytra.session;

import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.Player;
import jakarta.annotation.Nullable;

import java.util.HashMap;
import java.util.UUID;

/**
 * Manages sessions for a multiplayer game, allowing players to create, join, and leave sessions.
 */
public class SessionManager {

    private static SessionManager instance;

    private final HashMap<String, Fleet> sessions;

    /**
     * Private constructor for singleton pattern.
     */
    private SessionManager() {
        this.sessions = new HashMap<>();
    }

    /**
     * Returns the singleton instance of the SessionManager.
     *
     * @return The singleton instance of SessionManager.
     */
    public static SessionManager getInstance() {
        if (SessionManager.instance == null) {
            instance = new SessionManager();
        }
        return instance;
    }

    /**
     * Creates a new session with a unique ID and adds it to the sessions map.
     */
    public void createSession() {
        String uuid = UUID.randomUUID().toString().substring(0, 7);
        sessions.put(uuid, new Fleet(uuid));
    }

    /**
     * Checks if a session with the given ID exists.
     *
     * @param sessionId The ID of the session to check.
     * @return true if the session exists, false otherwise.
     */
    public boolean isSessionExist(String sessionId) {
        return sessions.containsKey(sessionId);
    }

    /**
     * Attempts to add a player to a session with the given ID. If the player is already
     * in another session, they are removed from the old session before joining the new one.
     *
     * @param sessionId The ID of the session to join.
     * @param player    The player attempting to join the session.
     * @return true if the player was successfully added, false otherwise.
     */
    public boolean joinSession(String sessionId, Player player) {
        // First, leave any session the player might currently be in
        leaveSession(player);

        Fleet fleet = getFleetFromId(sessionId);
        if (fleet == null) {
            return false;
        }
        fleet.getPlayers().add(player);
        return true;
    }

    /**
     * Removes a player from any session they are part of.
     *
     * @param player The player to remove from their session.
     */
    public void leaveSession(Player player) {
        for (Fleet fleet : sessions.values()) {
            if (fleet.getPlayers().remove(player)) {
                // Assuming a player can only be in one session at a time.
                break;
            }
        }
    }

    /**
     * Retrieves a Fleet instance for a given session ID, if it exists.
     *
     * @param sessionId The ID of the session.
     * @return The Fleet instance for the given session ID, or null if it doesn't exist.
     */
    @Nullable
    public Fleet getFleetFromId(String sessionId) {
        return sessions.getOrDefault(sessionId, null);
    }
}
