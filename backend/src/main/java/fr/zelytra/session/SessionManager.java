package fr.zelytra.session;

import com.fasterxml.jackson.databind.ObjectMapper;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.Player;
import io.quarkus.logging.Log;
import jakarta.annotation.Nullable;

import java.io.IOException;
import java.util.*;

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
     *
     * @return UUID of the created session
     */
    public String createSession() {
        String uuid = UUID.randomUUID().toString().substring(0, 7).toUpperCase();
        sessions.put(uuid, new Fleet(uuid));
        Log.info("[" + uuid + "] Session created !");
        return uuid;
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
        if (getPlayerFromSessionId(player.getSocket().getId()) != null) {
            leaveSession(player);
        }

        Fleet fleet = getFleetFromId(sessionId);
        if (fleet == null) {
            Log.error("[" + sessionId + "] Session doesnt exist for player : " + player.getUsername());
            return false;
        }
        fleet.getPlayers().add(player);
        Log.info("[" + sessionId + "] " + player.getUsername() + " Join the session !");
        return true;
    }

    /**
     * Removes a player from any session they are part of.
     *
     * @param player The player to remove from their session.
     */
    public void leaveSession(Player player) {
        for (Fleet fleet : sessions.values()) {
            fleet.getPlayers().remove(player);
            SessionSocket.broadcastSessionUpdate(fleet.getSessionId());
            Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " Leave the session !");

            // Clean empty session
            if (fleet.getPlayers().isEmpty()) {
                sessions.remove(fleet.getSessionId());
                Log.info("[" + fleet.getSessionId() + "] Has been disbanded");
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
        if (sessionId == null) return null;
        return sessions.getOrDefault(sessionId, null);
    }

    /**
     * Retrieves a Player from any session by their WebSocket session ID.
     *
     * @param sessionId The WebSocket session ID of the player.
     * @return The Player with the matching WebSocket session ID, or null if not found.
     */
    public Player getPlayerFromSessionId(String sessionId) {
        for (Map.Entry<String, Fleet> sessionEntry : sessions.entrySet()) {
            Fleet fleet = sessionEntry.getValue();
            for (Player player : fleet.getPlayers()) {
                if (player.getSocket().getId().equals(sessionId)) {
                    return player;
                }
            }
        }
        return null; // Player not found in any session
    }

    /**
     * Retrieves the Fleet containing a Player by their WebSocket session ID.
     *
     * @param username The WebSocket session ID of the player.
     * @return The Fleet containing the Player with the matching WebSocket session ID, or null if not found.
     */
    public Fleet getFleetByPlayerName(String username) {
        for (Map.Entry<String, Fleet> sessionEntry : sessions.entrySet()) {
            Fleet fleet = sessionEntry.getValue();
            for (Player player : fleet.getPlayers()) {
                if (player.getUsername().equals(username)) {
                    return fleet; // Return the Fleet containing the player
                }
            }
        }
        return null; // Fleet not found because the player is not in any session
    }

    /**
     * Checks if a specific player is in a specific session by the session ID.
     *
     * @param player    The player to check for in the session.
     * @param sessionId The ID of the session to check.
     * @return true if the specified player is in the session with the given ID, false otherwise.
     */
    public boolean isPlayerInSession(Player player, String sessionId) {
        Fleet fleet = sessions.get(sessionId);
        if (fleet != null) {
            // Iterate through the players in the fleet to check if the specified player is present
            for (Player fleetPlayer : fleet.getPlayers()) {
                if (fleetPlayer.getUsername().equalsIgnoreCase(player.getUsername())) {
                    return true; // The specified player is found in the session
                }
            }
        }
        return false; // The specified player is not found in the session
    }


}
