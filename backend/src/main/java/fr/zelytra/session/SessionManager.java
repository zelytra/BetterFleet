package fr.zelytra.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import fr.zelytra.statistics.StatisticsEntity;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.logging.Log;
import jakarta.annotation.Nullable;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.control.ActivateRequestContext;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.websocket.Session;

import java.io.IOException;
import java.util.Map;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;

/**
 * Manages sessions for a multiplayer game, allowing players to create, join, and leave sessions.
 */
@ApplicationScoped
public class SessionManager {

    private final ConcurrentHashMap<String, Fleet> sessions = new ConcurrentHashMap<>();

    // SotServer cached to avoid API spam and faster server response
    private final ConcurrentHashMap<String, SotServer> sotServers = new ConcurrentHashMap<>();

    @Inject
    StatisticsRepository statisticsRepository;

    @Inject
    ExecutorService executor;

    /**
     * Creates a new session with a unique ID and adds it to the sessions map.
     *
     * @return UUID of the created session
     */
    public String createSession() {
        Fleet fleet = new Fleet();
        sessions.put(fleet.getSessionId(), fleet);
        if (executor != null) {
            executor.submit(this::incrementSession);
        }
        Log.info("[" + fleet.getSessionId() + "] Session created !");
        return fleet.getSessionId();
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
            sendDataToPlayer(player.getSocket(), MessageType.SESSION_NOT_FOUND, null);
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

        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
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
        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
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
        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    public ConcurrentHashMap<String, Fleet> getSessions() {
        return this.sessions;
    }

    /**
     * Broadcasts a message to all players within a session.
     * <p>
     * This method sends a specified data object to all players in a session identified by the sessionId. The message type
     * and data to be broadcast are specified by the parameters. It uses {@link SessionManager} to check if the session
     * exists and to retrieve the corresponding {@link Fleet} of players. If the session does not exist, it logs an info
     * message and returns without sending any data. It constructs a {@link SocketMessage} with the messageType and data,
     * converts it into JSON format, and then broadcasts this JSON string to all players in the session using their sockets.
     * If any error occurs during the JSON conversion or broadcasting, it logs an error or throws an {@link Error} respectively.
     *
     * @param <T>         The type of data to be broadcasted. This allows the method to be used with various types of
     *                    data objects.
     * @param sessionId   The ID of the session to which the data will be broadcast. This is used to identify the
     *                    group of players who should receive the message.
     * @param messageType The type of the message to be sent. This helps in identifying the purpose or action of
     *                    the message on the client side.
     * @param data        The data to be broadcast. This is the actual content of the message being sent to the players.
     *                    The type of this data is generic, allowing for flexibility in what can be sent.
     * @throws Error if there is an issue with converting the {@link SocketMessage} object to a JSON string.
     */
    public <T> void broadcastDataToSession(String sessionId, MessageType messageType, T data) {

        if (!isSessionExist(sessionId)) {
            Log.info("[" + sessionId + "] Failed to broadcast, session not found");
            return;
        }
        Fleet fleet = getFleetFromId(sessionId);
        assert fleet != null;

        String json = formatMessage(messageType, data);

        for (Player player : fleet.getPlayers()) {

            if (player.getSocket() == null || player.getSocket().getAsyncRemote() == null) {
                Log.error("Failed to retrieve the player socket of " + player.getUsername());
                continue;
            }

            player.getSocket().getAsyncRemote().sendText(json, result -> {
                if (result.getException() != null) {
                    Log.error("Unable to send message: " + result.getException());
                }
            });
        }
    }

    /**
     * Sends a message to a player within a session identified by the WebSocket ID.
     * <p>
     * This method sends a specified data object to a player in a session identified by the WebSocket ID. The message type
     * and data to be broadcast are specified by the parameters. It uses {@link SessionManager} to check if the session
     * and the corresponding WebSocket connection exist. If the session or WebSocket does not exist, it logs an info
     * message and returns without sending any data. It constructs a {@link SocketMessage} with the messageType and data,
     * converts it into JSON format, and then sends this JSON string to the player using their WebSocket.
     * If any error occurs during the JSON conversion or sending, it logs an error or throws an {@link Error} respectively.
     *
     * @param <T>         The type of data to be sent. This allows the method to be used with various types of
     *                    data objects.
     * @param session     The WebSocket to which the data will be sent. This is used to identify the
     *                    player who should receive the message.
     * @param messageType The type of the message to be sent. This helps in identifying the purpose or action of
     *                    the message on the client side.
     * @param data        The data to be sent. This is the actual content of the message being sent to the player.
     *                    The type of this data is generic, allowing for flexibility in what can be sent.
     * @throws Error if there is an issue with converting the {@link SocketMessage} object to a JSON string.
     */
    public <T> void sendDataToPlayer(Session session, MessageType messageType, T data) {
        String json = formatMessage(messageType, data);

        if (session == null || session.getAsyncRemote() == null) {
            Log.error("Failed to get the player socket");
            return;
        }

        // Send the data to the specific WebSocket connection
        session.getAsyncRemote().sendText(json, result -> {
            if (result.getException() != null) {
                Log.error("Unable to send message to [" + session.getId() + "]: " + result.getException());
            }
        });
    }

    private <T> String formatMessage(MessageType messageType, T data) {
        SocketMessage<T> message = new SocketMessage<>(messageType, data);

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS); // To serialize as ISO-8601 strings
        objectMapper.setTimeZone(TimeZone.getTimeZone("UTC"));
        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (JsonProcessingException e) {
            throw new Error(e);
        }
        return json;
    }

    @ActivateRequestContext
    @Transactional
    public void incrementSession() {
        StatisticsEntity entity = statisticsRepository.getEntity();
        entity.setSessionsOpen(entity.getSessionsOpen() + 1);
    }

    @ActivateRequestContext
    @Transactional
    public void incrementTry() {
        StatisticsEntity entity = statisticsRepository.getEntity();
        entity.setSessionTry(entity.getSessionTry() + 1);
    }
}
