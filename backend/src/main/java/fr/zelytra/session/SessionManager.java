package fr.zelytra.session;

import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import io.quarkus.logging.Log;
import jakarta.annotation.Nullable;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Manages sessions for a multiplayer game, allowing players to create, join, and leave sessions.
 */
public class SessionManager {

    private static SessionManager instance;

    private final ConcurrentHashMap<String, Fleet> sessions;

    // SotServer cached to avoid API spam and faster server response
    private final ConcurrentHashMap<String, SotServer> sotServers;

    /**
     * Private constructor for singleton pattern.
     */
    private SessionManager() {
        this.sessions = new ConcurrentHashMap<>();
        this.sotServers = new ConcurrentHashMap<>();
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
     * @return the Fleet where the player was added or null
     */
    public Fleet joinSession(String sessionId, Player player) {
        // First, leave any session the player might currently be in
        if (getPlayerFromSessionId(player.getSocket().getId()) != null) {
            leaveSession(player);
        }

        Fleet fleet = getFleetFromId(sessionId);
        if (fleet == null) {
            SessionSocket.sendDataToPlayer(player.getSocket(), MessageType.SESSION_NOT_FOUND, null);
            try {
                player.getSocket().close();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            Log.error("[" + sessionId + "] Session doesnt exist for player : " + player.getUsername());
            return null;
        }
        fleet.getPlayers().add(player);
        Log.info("[" + sessionId + "] " + player.getUsername() + " Join the session !");
        return fleet;
    }

    /**
     * Removes a player from any session they are part of.
     *
     * @param player The player to remove from their session.
     */
    public void leaveSession(Player player) {

        Fleet fleet = getFleetByPlayerName(player.getUsername());

        SotServer sotServer = getSotServerFromPlayer(player);
        if (sotServer != null) {
            playerLeaveSotServer(player, sotServer);
        }

        fleet.getPlayers().remove(player);
        fleet.getServers().forEach((key, value) -> value.getConnectedPlayers().remove(player));

        // Check if player was master, then give another user the master role
        if (player.isMaster() && !fleet.getPlayers().isEmpty()) {
            Player newMaster = fleet.getPlayers().get(0);
            newMaster.setMaster(true);
            Log.info("[" + fleet.getSessionId() + "] Master as left, giving the role to " + newMaster.getUsername());
        }

        SessionSocket.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " Leave the session !");

        // Clean empty session
        if (fleet.getPlayers().isEmpty()) {
            sessions.remove(fleet.getSessionId());
            Log.info("[" + fleet.getSessionId() + "] Has been disbanded");
        }

    }

    /**
     * Retrieves the {@link SotServer} instance that a specified player is currently connected to.
     * <p>
     * This method iterates through all sessions and their corresponding fleets to find the SotServer
     * to which the specified player is connected. If the player is found within a SotServer's
     * connected players list, that SotServer is returned.
     * <p>
     * It is assumed that a player can only be connected to one SotServer at any given time.
     * If the player is not connected to any SotServer, or if the player does not exist,
     * this method returns {@code null}.
     *
     * @param player The {@link Player} whose SotServer connection is to be retrieved.
     * @return The {@link SotServer} instance the player is connected to, or {@code null} if the player
     * is not connected to any SotServer or does not exist.
     */
    public SotServer getSotServerFromPlayer(Player player) {
        for (Fleet fleet : sessions.values()) {
            for (SotServer server : fleet.getServers().values()) {
                if (server.getConnectedPlayers().contains(player)) {
                    return server;
                }
            }
        }
        return null;
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

    public SotServer getServerFromHashing(SotServer server) {
        String hash = server.generateHash();

        // Return cached SOT server
        if (sotServers.containsKey(hash)) {
            return sotServers.get(hash);
        }

        // The object inject may not be completed, so we're creating fresh one to make sure all data has been initialized
        SotServer newServer = new SotServer(server.getIp(), server.getPort());
        sotServers.put(newServer.getHash(), newServer);
        return newServer;
    }

    public void playerJoinSotServer(Player player, SotServer server) {
        SotServer findedSotServer = getServerFromHashing(server);

        Fleet fleet = getFleetByPlayerName(player.getUsername());
        assert fleet != null;

        // Detect if the server is not already know by the fleet
        if (!fleet.getServers().containsKey(findedSotServer.getHash())) {
            fleet.getServers().put(findedSotServer.getHash(), findedSotServer);
        }
        // Do not add player if already in
        if (fleet.getServers().get(findedSotServer.getHash()).getConnectedPlayers().contains(player)) {
            return;
        }

        // Add player to SotServer in Fleet and broadcast update
        fleet.getServers().get(findedSotServer.getHash()).getConnectedPlayers().add(player);
        Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " join the SotServer: " + fleet.getServers().get(findedSotServer.getHash()).getHash());
        SessionSocket.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    public void playerLeaveSotServer(Player player, SotServer server) {
        SotServer findedSotServer = getServerFromHashing(server);

        Fleet fleet = getFleetByPlayerName(player.getUsername());
        assert fleet != null;

        SotServer fleetFindedServer = fleet.getServers().get(findedSotServer.getHash());
        fleetFindedServer.getConnectedPlayers().remove(player);

        // If SotServer empty remove server from the list
        if (fleetFindedServer.getConnectedPlayers().isEmpty()) {
            fleet.getServers().remove(fleetFindedServer.getHash());
        }
        Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " leave the SotServer: " + fleetFindedServer.getHash());
        SessionSocket.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }
}
