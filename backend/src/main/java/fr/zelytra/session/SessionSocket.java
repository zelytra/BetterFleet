package fr.zelytra.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.SessionNameFilter;
import fr.zelytra.session.ip.GeoLocationResolver;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.player.PlayerAction;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import fr.zelytra.session.socket.security.SocketSecurityEntity;
import io.quarkus.logging.Log;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.*;

// WebSocket endpoint
@ServerEndpoint(value = "/sessions/{token}/{sessionId}")
public class SessionSocket {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    // Fires a while after each countdown to record the alliance-formation outcome (issue #673).
    private final ScheduledExecutorService attemptRecorder = Executors.newSingleThreadScheduledExecutor();
    public static final ConcurrentMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();
    private static final int RISE_ANCHOR_TIMER = 3; // in seconds
    public static String PROXY_API_KEY = "";

    @ConfigProperty(name = "app.version")
    List<String> appVersion;

    @ConfigProperty(name = "proxy.check.api.key")
    String proxyApiKey;

    // How long after a countdown to snapshot the fleet and record the alliance-formation outcome
    // (issue #673) — long enough for detection to settle. Configurable so tests can shorten it.
    @ConfigProperty(name = "betterfleet.stats.attempt-delay-seconds", defaultValue = "30")
    int attemptDelaySeconds;

    @Inject
    SessionManager sessionManager;

    @Inject
    ExecutorService sqlExecutor;

    @Inject
    GeoLocationResolver geoLocationResolver;

    @OnOpen
    public void onOpen(Session session) {
        // Start a timeout task
        Future<?> timeoutTask = executor.submit(() -> {
            try {
                // Wait for a certain period for the initial message
                TimeUnit.SECONDS.sleep(1); // 1 seconds timeout
                // If the initial message is not received, close the session
                Log.info("[" + session.getId() + "] Timeout reached. Closing session.");
                session.close();
            } catch (InterruptedException | IOException e) {
                Thread.currentThread().interrupt();
            }
        });
        sessionTimeoutTasks.put(session.getId(), timeoutTask);
        Log.info("[ANYONE] Connecting...");
    }


    @OnMessage
    public void onMessage(String message, Session session, @PathParam("sessionId") String sessionId, @PathParam("token") String token) throws IOException {

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        objectMapper.enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS);

        // Deserialize the incoming message to SocketMessage<?>
        SocketMessage<?> socketMessage = objectMapper.readValue(message, new TypeReference<>() {
        });

        // Handle the message based on its type
        switch (socketMessage.messageType()) {
            case CONNECT -> {
                Player player = objectMapper.convertValue(socketMessage.data(), Player.class);
                handleConnectMessage(player, session, sessionId, token);
            }
            case UPDATE -> {
                Player player = objectMapper.convertValue(socketMessage.data(), Player.class);
                handleUpdateMessage(player);
            }
            case KICK_PLAYER -> {
                PlayerAction action = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handleKick(session, action);
            }
            case PROMOTE_PLAYER -> {
                PlayerAction action = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(session, action, true);
            }
            case DEMOTE_PLAYER -> {
                PlayerAction action = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(session, action, false);
            }
            case SET_VISIBILITY -> {
                Boolean isPrivate = objectMapper.convertValue(socketMessage.data(), Boolean.class);
                if (isPrivate != null) {
                    handleSetVisibility(session, isPrivate);
                }
            }
            case RENAME_SESSION -> {
                String name = objectMapper.convertValue(socketMessage.data(), String.class);
                handleRenameSession(session, name);
            }
            case START_COUNTDOWN -> handleStartCountdown(session);
            case CLEAR_STATUS -> handleClearStatus(session);
            case KEEP_ALIVE -> {
            }
            case JOIN_SERVER -> {
                PROXY_API_KEY = proxyApiKey;
                SotServer sotServer = objectMapper.convertValue(socketMessage.data(), SotServer.class);
                handleJoinServerMessage(session, sotServer);
            }
            case LEAVE_SERVER -> {
                SotServer sotServer = objectMapper.convertValue(socketMessage.data(), SotServer.class);
                handleLeaveServerMessage(session, sotServer);
            }
            default -> Log.info("Unhandled message type: " + socketMessage.messageType());
        }
    }

    /**
     * Kicks a player from the requester's fleet. The action is only honored when the caller is
     * resolved from its own socket and holds the master role of that fleet, and the target must
     * belong to the same fleet — the client is never trusted to assert this itself.
     */
    private void handleKick(Session session, PlayerAction action) {
        Player requester = sessionManager.getPlayerFromSessionId(session.getId());
        if (requester == null) {
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(requester.getUsername());
        if (fleet == null) {
            return;
        }
        if (!requester.isMaster()) {
            Log.warn("[" + fleet.getSessionId() + "] " + requester.getUsername() + " attempted to kick " + action.username() + " without master rights, ignored");
            return;
        }
        Player target = fleet.getPlayerFromUsername(action.username());
        if (target == null) {
            Log.warn("[" + fleet.getSessionId() + "] " + action.username() + " cannot be kicked, not a member of this fleet");
            return;
        }
        Log.info("[" + fleet.getSessionId() + "] " + action.username() + " has been kicked by " + requester.getUsername());
        sessionManager.leaveSession(target);
    }

    /**
     * Promotes or demotes a player within the requester's fleet. Same authorization rules as
     * {@link #handleKick}: the caller must be a master of the fleet and the target a member of it.
     */
    private void handlePromote(Session session, PlayerAction action, boolean master) {
        Player requester = sessionManager.getPlayerFromSessionId(session.getId());
        if (requester == null) {
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(requester.getUsername());
        if (fleet == null) {
            return;
        }
        if (!requester.isMaster()) {
            Log.warn("[" + fleet.getSessionId() + "] " + requester.getUsername() + " attempted to " + (master ? "promote" : "demote") + " " + action.username() + " without master rights, ignored");
            return;
        }
        Player target = fleet.getPlayerFromUsername(action.username());
        if (target == null) {
            Log.warn("[" + fleet.getSessionId() + "] " + action.username() + " cannot be " + (master ? "promoted" : "demoted") + ", not a member of this fleet");
            return;
        }
        target.setMaster(master);
        Log.info("[" + fleet.getSessionId() + "] " + action.username() + " has been " + (master ? "promoted" : "demoted") + " by " + requester.getUsername());
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    /**
     * Toggles the session's public/private visibility. Only the fleet master may change it — the
     * client is never trusted to assert this itself (same authorization rules as {@link #handleKick}).
     * A private session stays unlisted and joinable only by its code; a public one becomes eligible
     * for the public sessions directory.
     */
    private void handleSetVisibility(Session session, boolean isPrivate) {
        Player requester = sessionManager.getPlayerFromSessionId(session.getId());
        if (requester == null) {
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(requester.getUsername());
        if (fleet == null) {
            return;
        }
        if (!requester.isMaster()) {
            Log.warn("[" + fleet.getSessionId() + "] " + requester.getUsername() + " attempted to change visibility without master rights, ignored");
            return;
        }
        fleet.setPrivate(isPrivate);
        Log.info("[" + fleet.getSessionId() + "] visibility set to " + (isPrivate ? "private" : "public") + " by " + requester.getUsername());
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        sessionManager.publishDirectoryChange();
    }

    /**
     * Sets (or clears) the session's custom name. Master-only, like the other session-level
     * controls. The name is trimmed and length-capped, and rejected when it trips the content
     * filter — public names are visible to everyone (issue #604). An empty name clears the custom
     * name and falls back to the default localized pirate name.
     */
    private void handleRenameSession(Session session, String name) {
        Player requester = sessionManager.getPlayerFromSessionId(session.getId());
        if (requester == null) {
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(requester.getUsername());
        if (fleet == null) {
            return;
        }
        if (!requester.isMaster()) {
            Log.warn("[" + fleet.getSessionId() + "] " + requester.getUsername() + " attempted to rename the session without master rights, ignored");
            return;
        }
        String cleaned = SessionNameFilter.clean(name);
        if (cleaned.isEmpty()) {
            fleet.setCustomName(null); // revert to the default localized pirate name
        } else if (!SessionNameFilter.isAllowed(cleaned)) {
            Log.warn("[" + fleet.getSessionId() + "] rename rejected by the content filter, ignored");
            return;
        } else {
            fleet.setCustomName(cleaned);
        }
        Log.info("[" + fleet.getSessionId() + "] renamed to '" + fleet.getCustomName() + "' by " + requester.getUsername());
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        sessionManager.publishDirectoryChange();
    }

    private void handleClearStatus(Session session) {

        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            return;
        }
        fleet.getPlayers().forEach((playerInList) -> {
            playerInList.setReady(false);
        });
        Log.info("[" + fleet.getSessionId() + "] Clearing status of all player");
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    private void handleStartCountdown(Session session) {

        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            return;
        }
        fleet.getStats().addTry();

        sqlExecutor.submit(sessionManager::incrementTry);

        Log.info("[" + fleet.getSessionId() + "] Starting countdown in " + SessionSocket.RISE_ANCHOR_TIMER + "s");
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.RUN_COUNTDOWN, SessionSocket.RISE_ANCHOR_TIMER);
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);

        // Record the alliance-formation outcome anonymously once detection has settled (issue #673).
        String recordSessionId = fleet.getSessionId();
        attemptRecorder.schedule(
                () -> sessionManager.recordAllianceAttempt(recordSessionId),
                RISE_ANCHOR_TIMER + attemptDelaySeconds, TimeUnit.SECONDS);
    }

    // Extracted method to handle JOIN_SERVER messages
    private void handleJoinServerMessage(Session session, SotServer sotServer) {
        // A payload-less JOIN_SERVER deserializes to null. Dropping it beats throwing: an
        // exception here reaches @OnError, which closes the socket and ejects the player from
        // their whole fleet session over a message that meant nothing.
        if (sotServer == null || sotServer.getIp() == null || sotServer.getIp().isEmpty()) {
            Log.warn("Ignoring JOIN_SERVER without a server payload");
            return;
        }
        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        // Join first: this is cache-only and does no I/O, so the player shows up under their server
        // straight away.
        SotServer resolved = manager.resolveSotServer(sotServer);
        manager.playerJoinSotServer(player, resolved);

        // Then chase the geolocation off this thread: we are on a vert.x event loop, and
        // proxycheck.io routinely takes seconds or times out. Location and country code are
        // broadcast when they land — the country code being what the browser's region flag needs.
        if (resolved.getLocation().isEmpty()) {
            geoLocationResolver.resolveAndBroadcast(sotServer);
        }
    }

    // Extracted method to handle LEAVE_SERVER messages
    private void handleLeaveServerMessage(Session session, SotServer sotServer) {
        // Same guard as JOIN_SERVER: a client that never joined a server can still send a
        // payload-less LEAVE_SERVER (seen from clients quitting the game before the server
        // identity resolved). playerLeaveSotServer would NPE on it, and @OnError would then
        // close the socket — kicking the player out of their fleet for backing out of a game.
        if (sotServer == null || sotServer.getIp() == null || sotServer.getIp().isEmpty()) {
            Log.warn("Ignoring LEAVE_SERVER without a server payload");
            return;
        }
        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        manager.playerLeaveSotServer(player, sotServer);
    }

    // Extracted method to handle CONNECT messages
    public void handleConnectMessage(Player player, Session session, String sessionId, String token) throws IOException {
        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        // Checking security
        SocketSecurityEntity socketSecurity = SocketSecurityEntity.websocketUser.get(token);
        if (socketSecurity == null || !socketSecurity.isValid()) {
            Log.info("Invalid token, session will be closed");
            sessionManager.sendDataToPlayer(session, MessageType.CONNECTION_REFUSED, null);
            session.close();
            return;
        }
        SocketSecurityEntity.websocketUser.remove(token);

        // Guest join (web console players, #682): the session code is the credential, so a guest token
        // may only open the exact session it was minted for and never creates one, and a guest is
        // never a host (they can't self-declare master to gain kick/rename/visibility rights).
        boolean guest = socketSecurity.isGuest();
        if (guest) {
            if (sessionId == null || sessionId.isEmpty()
                    || !sessionId.equalsIgnoreCase(socketSecurity.getBoundSessionId())) {
                Log.info("Guest token used outside its bound session, connection refused");
                sessionManager.sendDataToPlayer(session, MessageType.CONNECTION_REFUSED, null);
                session.close();
                return;
            }
            player.setMaster(false);
            player.setGuest(true);
        }

        // Refuse connection from an out-of-date client. Web guests carry no app version (they follow
        // the live site, not a released build), so the allowlist only gates the desktop app.
        if (!guest && (player.getClientVersion() == null || !appVersion.contains(player.getClientVersion()))) {
            Log.warn("[" + player.getUsername() + "] Client is out of date, connection refused (" + player.getClientVersion() + ")");
            try {
                sessionManager.sendDataToPlayer(session, MessageType.OUTDATED_CLIENT, null);
                session.close();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
            return;
        }

        // Kick the player without username
        if (player.getUsername() == null) {
            Log.info("A NULL user try to connect to application");
            return;
        }

        session.setMaxIdleTimeout(30000); // 1h of timeout

        SessionManager manager = sessionManager;

        Log.info("[" + player.getUsername() + "] Connected !");

        //Create session if no id provided
        if (sessionId == null || sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            Fleet fleet = manager.joinSession(newSessionId, player);
            player.setMaster(true);
            player.setSocket(session);
            if (fleet != null) {
                // The creator is the host: seed the session banner from their preference.
                fleet.setBanner(player.getBanner());
                sessionManager.broadcastDataToSession(newSessionId, MessageType.UPDATE, fleet);
            }
        } else {
            player.setSocket(session);
            Fleet fleet = manager.joinSession(sessionId, player);
            if (fleet != null) {
                sessionManager.broadcastDataToSession(sessionId, MessageType.UPDATE, fleet);
            }
        }
    }

    private void handleUpdateMessage(Player player) {
        SessionManager manager = sessionManager;
        Fleet fleet = manager.getFleetFromId(player.getSessionId());
        if (fleet == null) {
            Log.warn("[" + player.getUsername() + "] Update ignored, session " + player.getSessionId() + " no longer exists");
            return;
        }
        Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());
        if (foundedplayer == null) {
            Log.warn("[" + player.getUsername() + "] Update ignored, not a member of session " + player.getSessionId());
            return;
        }

        foundedplayer.setReady(player.isReady());
        foundedplayer.setStatus(player.getStatus());
        foundedplayer.setDevice(player.getDevice());
        foundedplayer.setBoatSize(player.getBoatSize());

        sessionManager.broadcastDataToSession(player.getSessionId(), MessageType.UPDATE, fleet);

        Log.info("[" + player.getUsername() + "] Data updated for session !");
    }

    @OnClose
    public void onClose(Session session) {
        handleSocketClose(session);
    }

    @OnError
    public void onError(Session session, Throwable throwable) throws IOException {
        Log.error("WebSocket error for session " + session.getId() + ": " + throwable);
        handleSocketClose(session);
        session.close();
    }

    private void handleSocketClose(Session session) {
        // Clean up resources related to the session
        sessionTimeoutTasks.remove(session.getId());

        try {
            SessionManager manager = sessionManager;
            Player player = manager.getPlayerFromSessionId(session.getId());
            if (player != null) {
                manager.leaveSession(player);
                Log.info("[" + player.getUsername() + "] Disconnected");
            } else {
                Log.warn("[UNDEFINED PLAYER] Disconnected");
            }
        } catch (Exception e) {
            // Cleanup must never throw: this runs from onClose/onError, and a throw here re-enters
            // onError and spirals (the LockException storms seen in production logs).
            Log.error("Failed to clean up socket " + session.getId() + ": " + e);
        }
    }

    public String getProxyApiKey() {
        return proxyApiKey;
    }
}
