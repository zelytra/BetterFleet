package fr.zelytra.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.PublicSession;
import fr.zelytra.session.fleet.PublicSessionsSnapshot;
import fr.zelytra.session.ip.ProxyCheckAPI;
import io.smallrye.mutiny.Multi;
import io.smallrye.mutiny.operators.multi.processors.BroadcastProcessor;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import fr.zelytra.statistics.StatisticsEntity;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.arc.Lock;
import io.quarkus.logging.Log;
import jakarta.annotation.Nullable;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.context.control.ActivateRequestContext;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.websocket.Session;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.core.Response;

import java.io.IOException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.TimeZone;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.concurrent.ExecutorService;

/**
 * Manages sessions for a multiplayer game, allowing players to create, join, and leave sessions.
 */
@ApplicationScoped
@Lock
@Path("servers")
public class SessionManager {

    private final ConcurrentMap<String, Fleet> sessions = new ConcurrentHashMap<>();

    // SotServer cached to avoid API spam and faster server response
    private final ConcurrentMap<String, SotServer> sotServers = new ConcurrentHashMap<>();

    // Emits a signal whenever the set of public sessions changes (create / join / leave /
    // visibility / server), so SSE subscribers (the public sessions browser) refresh. Only
    // structural changes publish here — ready-state spikes do not — which keeps the stream quiet.
    private final BroadcastProcessor<Boolean> directoryChanges = BroadcastProcessor.create();

    @Inject
    StatisticsRepository statisticsRepository;

    @Inject
    ExecutorService executor;

    @Inject
    ProxyCheckAPI proxyCheckAPI;

    @GET
    @Path("ip")
    public Response getIp() {
        return Response.ok(sotServers).build();
    }

    /**
     * Creates a new session with a unique ID and adds it to the sessions map.
     *
     * @return UUID of the created session
     */
    @Lock(value = Lock.Type.WRITE, time = 200)
    public String createSession() {
        Fleet fleet = new Fleet();
        sessions.put(fleet.getSessionId(), fleet);
        if (executor != null) {
            executor.submit(this::incrementSession);
        }
        Log.info("[" + fleet.getSessionId() + "] Session created !");
        publishDirectoryChange();
        return fleet.getSessionId();
    }

    /**
     * Checks if a session with the given ID exists.
     *
     * @param sessionId The ID of the session to check.
     * @return true if the session exists, false otherwise.
     */
    @Lock(value = Lock.Type.READ, time = 200)
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
    @Lock(value = Lock.Type.WRITE, time = 200)
    public Fleet joinSession(String sessionId, Player player) {

        Fleet currentFleet = getFleetByPlayerName(player.getUsername());
        if (currentFleet != null && currentFleet.getSessionId().equals(sessionId)) {
            // The account is already a member of the very session it is trying to join
            // (e.g. the same account connected from a second device/socket). Refuse the
            // duplicate join and leave the existing members untouched instead of tearing
            // the fleet down — see issue #436. A lingering ghost (already-closed socket)
            // is not a real duplicate, so in that case we fall through and replace it.
            Player existing = currentFleet.getPlayerFromUsername(player.getUsername());
            if (existing != null && existing.getSocket() != null && existing.getSocket().isOpen()) {
                Log.warn("[" + sessionId + "] " + player.getUsername() + " is already connected to this session, duplicate join refused");
                sendDataToPlayer(player.getSocket(), MessageType.CONNECTION_REFUSED, null);
                closeSocketQuietly(player.getSocket());
                return null;
            }
            leaveSession(existing != null ? existing : player);
        } else if (currentFleet != null) {
            // The account is in a different session; a player can only be in one session at
            // a time, so leave the previous one before joining the new one.
            leaveSession(player);
        }

        Fleet fleet = getFleetFromId(sessionId);
        if (fleet == null) {
            sendDataToPlayer(player.getSocket(), MessageType.SESSION_NOT_FOUND, null);
            try {
                if (player.getSocket() != null) {
                    player.getSocket().close();
                }
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            Log.error("[" + sessionId + "] Session doesnt exist for player : " + player.getUsername());
            return null;
        }
        fleet.getPlayers().add(player);
        Log.info("[" + sessionId + "] " + player.getUsername() + " Join the session !");
        publishDirectoryChange();
        return fleet;
    }

    /**
     * Removes a player from any session they are part of.
     *
     * @param player The player to remove from their session.
     */
    @Lock(value = Lock.Type.WRITE, time = 200)
    public void leaveSession(Player player) {

        Fleet fleet = getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            // Nothing to leave (already removed or never joined); still make sure the socket
            // is not left dangling.
            closeSocketQuietly(player.getSocket());
            return;
        }

        SotServer sotServer = getSotServerFromPlayer(player);
        if (sotServer != null) {
            playerLeaveSotServer(player, sotServer);
        }

        // Remove player from the session player list and connected player list
        List<Player> playerToRemove = new ArrayList<>();
        for (Player fleetPlayer : fleet.getPlayers()) {
            if (fleetPlayer.getUsername().equalsIgnoreCase(player.getUsername())) {
                playerToRemove.add(fleetPlayer);
            }
        }
        fleet.getPlayers().removeAll(playerToRemove);
        fleet.getServers().forEach((key, value) -> value.getConnectedPlayers().remove(player));

        // Check if player was master, then give another user the master role
        if (player.isMaster() && !fleet.getPlayers().isEmpty()) {
            Player newMaster = fleet.getPlayers().get(0);
            newMaster.setMaster(true);
            Log.info("[" + fleet.getSessionId() + "] Master as left, giving the role to " + newMaster.getUsername());
        }

        // Broadcast player leave data to the session
        if (!fleet.getPlayers().isEmpty()) {
            broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        }
        Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " Leave the session !");

        // Clean empty session
        if (fleet.getPlayers().isEmpty()) {
            sessions.remove(fleet.getSessionId());
            Log.info("[" + fleet.getSessionId() + "] Has been disbanded");
        }

        //Close the socket if not yet closed
        publishDirectoryChange();
        closeSocketQuietly(player.getSocket());
    }

    /**
     * Closes a WebSocket session if it is still open, swallowing any I/O error so that a failure
     * to close one player's socket never interrupts session bookkeeping or a broadcast loop.
     *
     * @param socket the session to close; may be {@code null}
     */
    private void closeSocketQuietly(@Nullable Session socket) {
        if (socket == null || !socket.isOpen()) {
            return;
        }
        try {
            socket.close();
        } catch (IOException e) {
            Log.error("Failed to close socket [" + socket.getId() + "]: " + e.getMessage());
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
    @Lock(value = Lock.Type.READ, time = 200)
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
    @Lock(value = Lock.Type.READ, time = 200)
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
    @Lock(value = Lock.Type.READ, time = 200)
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
    @Lock(value = Lock.Type.READ, time = 200)
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
    @Lock(value = Lock.Type.READ, time = 200)
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

    /**
     * Resolves a client-reported server into the cached, geolocated {@link SotServer}.
     * <p>
     * Runs with <b>no lock on purpose</b>: on a cache miss it performs a blocking geolocation HTTP
     * call. This used to run while {@link #playerJoinSotServer} held the WRITE lock, so at the end
     * of a countdown — when every player joins their server at once — every other socket operation
     * blew the 200ms lock timeout. That threw a LockException into onError, which closed the socket
     * (players kicked) and dropped the JOIN_SERVER, so the server only appeared after a reconnect
     * (by then a cache hit). The cache is a ConcurrentMap, so no lock is needed here.
     */
    @Lock(Lock.Type.NONE)
    public SotServer resolveSotServer(SotServer server) {
        SotServer cached = sotServers.get(server.generateHash());
        if (cached != null) {
            return cached.copy();
        }
        // Blocking geolocation — must never run while holding a lock.
        ProxyCheckAPI.Geo geo = proxyCheckAPI.resolveGeo(server.getIp());
        SotServer resolved = new SotServer(server.getIp(), server.getPort(),
                geo.location(), geo.countryCode());
        SotServer previous = sotServers.putIfAbsent(resolved.getHash(), resolved);
        return (previous != null ? previous : resolved).copy();
    }

    /**
     * Attaches a player to an <b>already-resolved</b> server — callers must go through
     * {@link #resolveSotServer} first. No I/O may happen here: this holds the WRITE lock and must
     * stay microseconds long.
     */
    @Lock(value = Lock.Type.WRITE, time = 200)
    public void playerJoinSotServer(Player player, SotServer findedSotServer) {
        Fleet fleet = getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            Log.warn("Cannot join SoT server: no fleet found for player " + player.getUsername());
            return;
        }

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
        publishDirectoryChange();
    }

    @Lock(value = Lock.Type.READ, time = 200)
    @Nullable
    public Player getPlayerFromUsername(String username) {
        Fleet fleet = this.getFleetByPlayerName(username);

        if (fleet == null) {
            Log.warn("Cannot find session for player: " + username);
            return null;
        }

        for (Player playerInList : fleet.getPlayers()) {
            if (playerInList.getUsername().equalsIgnoreCase(username)) {
                return playerInList;
            }
        }
        return null;
    }

    /**
     * Detaches a player from a server. Only the hash is needed to find it in the fleet, so this
     * never resolves the geolocation (no I/O) while holding the WRITE lock.
     */
    @Lock(value = Lock.Type.WRITE, time = 200)
    public void playerLeaveSotServer(Player player, SotServer server) {
        Fleet fleet = getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            Log.warn("Cannot leave SoT server: no fleet found for player " + player.getUsername());
            return;
        }

        SotServer fleetFindedServer = fleet.getServers().get(server.generateHash());
        if (fleetFindedServer == null) {
            // The fleet is not (or no longer) tracking this server; nothing to remove.
            return;
        }
        fleetFindedServer.getConnectedPlayers().remove(player);

        // If SotServer empty remove server from the list
        if (fleetFindedServer.getConnectedPlayers().isEmpty()) {
            fleet.getServers().remove(fleetFindedServer.getHash());
        }
        Log.info("[" + fleet.getSessionId() + "] " + player.getUsername() + " leave the SotServer: " + fleetFindedServer.getHash());
        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        publishDirectoryChange();
    }

    @Lock(value = Lock.Type.READ, time = 200)
    public ConcurrentMap<String, Fleet> getSessions() {
        return this.sessions;
    }

    @Lock(value = Lock.Type.READ, time = 200)
    public ConcurrentMap<String, SotServer> getSotServers() {
        return sotServers;
    }

    /**
     * Publishes a directory-changed signal to the public sessions SSE stream. Called after any
     * mutation that can affect the public list.
     */
    public void publishDirectoryChange() {
        directoryChanges.onNext(Boolean.TRUE);
    }

    /**
     * The current snapshot of public (listed) sessions, mapped to the browser's PublicSession DTO.
     */
    @Lock(value = Lock.Type.READ, time = 200)
    public List<PublicSession> getPublicSessions() {
        List<PublicSession> result = new ArrayList<>();
        for (Fleet fleet : sessions.values()) {
            if (fleet.isPrivate()) {
                continue;
            }
            result.add(toPublicSession(fleet));
        }
        return result;
    }

    /**
     * What the browser renders: the public sessions plus the global connected-player count, built
     * in one pass so both ride the same REST response and the same SSE frame — the counter has to
     * move live as players come and go, not only when Refresh is pressed.
     */
    @Lock(value = Lock.Type.READ, time = 200)
    public PublicSessionsSnapshot getPublicSessionsSnapshot() {
        List<PublicSession> publicSessions = new ArrayList<>();
        int connectedPlayers = 0;
        for (Fleet fleet : sessions.values()) {
            connectedPlayers += fleet.getPlayers().size();
            if (!fleet.isPrivate()) {
                publicSessions.add(toPublicSession(fleet));
            }
        }
        return new PublicSessionsSnapshot(publicSessions, connectedPlayers);
    }

    /**
     * SSE-friendly stream: emits the current snapshot on subscription, then a fresh one on every
     * structural change (create / join / leave / visibility / server) — exactly when either the
     * session list or the connected-player count can move.
     */
    public Multi<PublicSessionsSnapshot> streamPublicSessions() {
        return Multi.createBy().concatenating().streams(
                Multi.createFrom().item(this::getPublicSessionsSnapshot),
                directoryChanges.onItem().transform(ignored -> getPublicSessionsSnapshot())
        );
    }

    private PublicSession toPublicSession(Fleet fleet) {
        List<String> admins = fleet.getMasters().stream()
                .map(Player::getUsername)
                .collect(Collectors.toList());
        // A master-set custom name wins; otherwise the browser localizes the pirate-name seed.
        String name = (fleet.getCustomName() != null && !fleet.getCustomName().isBlank())
                ? fleet.getCustomName()
                : String.valueOf(fleet.getSessionName());
        return new PublicSession(
                fleet.getSessionId(),
                primaryRegion(fleet),
                admins,
                name,
                fleet.getPlayers().size(),
                fleet.isPrivate(),
                fleet.getBanner());
    }

    /**
     * The country-code flag shown for a session: taken from the server carrying the most players,
     * or "" when no server has been detected yet.
     */
    private String primaryRegion(Fleet fleet) {
        return fleet.getServers().values().stream()
                .max(Comparator.comparingInt(server -> server.getConnectedPlayers().size()))
                .map(SotServer::getCountryCode)
                .filter(code -> code != null && !code.isBlank())
                .orElse("");
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
        if (fleet == null) {
            Log.info("[" + sessionId + "] Failed to broadcast, fleet vanished");
            return;
        }

        String json = formatMessage(messageType, data);

        for (Player player : fleet.getPlayers()) {

            if (player.getSocket() == null || player.getSocket().getAsyncRemote() == null) {
                Log.error("Failed to retrieve the player socket of " + player.getUsername());
                continue;
            }

            // Skip players whose socket is already closed instead of aborting the whole
            // broadcast — a single dead/ghost socket must not stop the other members from
            // receiving the update (see issue #436).
            if (!player.getSocket().isOpen()) {
                Log.warn("Skipping closed socket of " + player.getUsername());
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

    public <T> String formatMessage(MessageType messageType, T data) {
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
