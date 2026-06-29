package fr.zelytra.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
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
    public static final ConcurrentMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();
    private static final int RISE_ANCHOR_TIMER = 3; // in seconds
    // 90s idle timeout: client sends KEEP_ALIVE every 30s, allowing up to 2 missed intervals
    private static final long WEBSOCKET_IDLE_TIMEOUT_MS = 90_000L;
    public static String PROXY_API_KEY = "";

    @ConfigProperty(name = "app.version")
    List<String> appVersion;

    @ConfigProperty(name = "proxy.check.api.key")
    String proxyApiKey;

    @Inject
    SessionManager sessionManager;

    @Inject
    ExecutorService sqlExecutor;

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
                PlayerAction player = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handleKick(session, player);
            }
            case PROMOTE_PLAYER -> {
                PlayerAction player = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(session, player, true);
            }
            case DEMOTE_PLAYER -> {
                PlayerAction player = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(session, player, false);
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

    private boolean authorizeMasterAction(Session session, String targetSessionId) {
        Player emitter = sessionManager.getPlayerFromSessionId(session.getId());
        if (emitter == null || !emitter.isMaster()) {
            Log.warn("Unauthorized action: player is not master");
            return false;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(emitter.getUsername());
        if (fleet == null || !fleet.getSessionId().equals(targetSessionId)) {
            Log.warn("Unauthorized action: player is not in target session");
            return false;
        }
        return true;
    }

    private void handleKick(Session session, PlayerAction player) {
        if (!authorizeMasterAction(session, player.sessionId())) {
            return;
        }
        Fleet fleet = sessionManager.getFleetFromId(player.sessionId());
        if (fleet == null) {
            Log.warn("Cannot kick player, session not found: " + player.sessionId());
            return;
        }
        Player foundedPlayer = fleet.getPlayerFromUsername(player.username());

        if (foundedPlayer != null) {
            Log.info("[" + fleet.getSessionId() + "] " + player.username() + " has been kicked from the session");
            sessionManager.leaveSession(foundedPlayer);
        } else {
            Log.warn("[" + fleet.getSessionId() + "] " + player.username() + " cannot be kicked, not found");
        }

    }

    private void handlePromote(Session session, PlayerAction player, boolean master) {
        if (!authorizeMasterAction(session, player.sessionId())) {
            return;
        }
        Fleet fleet = sessionManager.getFleetFromId(player.sessionId());
        if (fleet == null) {
            Log.warn("Cannot " + (master ? "promote" : "demote") + " player, session not found: " + player.sessionId());
            return;
        }
        Player foundedPlayer = fleet.getPlayerFromUsername(player.username());

        if (foundedPlayer != null) {
            Log.info("[" + fleet.getSessionId() + "] " + player.username() + " has been " + (master ? "promoted" : "demoted"));
            foundedPlayer.setMaster(master);
            sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        } else {
            Log.warn("[" + fleet.getSessionId() + "] " + player.username() + " cannot be " + (master ? "promoted" : "demoted") + ", not found");
        }
    }

    private void handleClearStatus(Session session) {

        Player player = sessionManager.getPlayerFromSessionId(session.getId());
        if (player == null || !player.isMaster()) {
            Log.warn("Unauthorized clear status attempt");
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(player.getUsername());
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

        Player player = sessionManager.getPlayerFromSessionId(session.getId());
        if (player == null || !player.isMaster()) {
            Log.warn("Unauthorized countdown attempt");
            return;
        }
        Fleet fleet = sessionManager.getFleetByPlayerName(player.getUsername());
        if (fleet == null) {
            return;
        }
        fleet.getStats().addTry();

        sqlExecutor.submit(sessionManager::incrementTry);

        Log.info("[" + fleet.getSessionId() + "] Starting countdown in " + SessionSocket.RISE_ANCHOR_TIMER + "s");
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.RUN_COUNTDOWN, SessionSocket.RISE_ANCHOR_TIMER);
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    // Extracted method to handle JOIN_SERVER messages
    private void handleJoinServerMessage(Session session, SotServer sotServer) {
        Player player = sessionManager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        sessionManager.playerJoinSotServer(player, sotServer);
    }

    // Extracted method to handle LEAVE_SERVER messages
    private void handleLeaveServerMessage(Session session, SotServer sotServer) {
        Player player = sessionManager.getPlayerFromSessionId(session.getId());
        if (player == null) {
            return;
        }
        sessionManager.playerLeaveSotServer(player, sotServer);
    }

    // Extracted method to handle CONNECT messages
    public void handleConnectMessage(Player player, Session session, String sessionId, String token) throws IOException {
        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        // Checking security
        SocketSecurityEntity.cleanupExpiredTokens();
        SocketSecurityEntity socketSecurity = SocketSecurityEntity.websocketUser.get(token);
        if (socketSecurity == null || !socketSecurity.isValid()) {
            Log.info("Invalid token, session will be closed");
            sessionManager.sendDataToPlayer(session, MessageType.CONNECTION_REFUSED, null);
            session.close();
            return;
        }
        SocketSecurityEntity.websocketUser.remove(token);

        // Refuse connection from client with different version
        if (player.getClientVersion() == null || !appVersion.contains(player.getClientVersion())) {
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

        session.setMaxIdleTimeout(WEBSOCKET_IDLE_TIMEOUT_MS);

        SessionManager manager = sessionManager;

        Log.info("[" + player.getUsername() + "] Connected !");

        //Create session if no id provided
        if (sessionId == null || sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            Fleet fleet = manager.joinSession(newSessionId, player);
            player.setMaster(true);
            player.setSocket(session);
            if (fleet != null) {
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
        Fleet fleet = sessionManager.getFleetFromId(player.getSessionId());
        if (fleet == null) {
            Log.warn("Cannot update player data, session not found: " + player.getSessionId());
            return;
        }
        Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());
        if (foundedplayer == null) {
            Log.warn("Cannot update player data, player not found: " + player.getUsername());
            return;
        }

        foundedplayer.setReady(player.isReady());
        foundedplayer.setStatus(player.getStatus());
        foundedplayer.setDevice(player.getDevice());

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

        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player != null) {
            manager.leaveSession(player);
            Log.info("[" + player.getUsername() + "] Disconnected");
        } else {
            Log.warn("[UNDEFINED PLAYER] Disconnected");
        }
    }

    public String getProxyApiKey() {
        return proxyApiKey;
    }
}
