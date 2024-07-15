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
import java.util.concurrent.*;

// WebSocket endpoint
@ServerEndpoint(value = "/sessions/{token}/{sessionId}")
public class SessionSocket {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    public static final ConcurrentMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();
    private static final int RISE_ANCHOR_TIMER = 3; // in seconds
    public static String PROXY_API_KEY = "";

    @ConfigProperty(name = "app.version")
    String appVersion;

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
                handleKick(player);
            }
            case PROMOTE_PLAYER -> {
                PlayerAction player = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(player, true);
            }
            case DEMOTE_PLAYER -> {
                PlayerAction player = objectMapper.convertValue(socketMessage.data(), PlayerAction.class);
                handlePromote(player, false);
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

    private void handleKick(PlayerAction player) {
        SessionManager manager = sessionManager;
        Fleet fleet = manager.getFleetByPlayerName(player.username());
        Player foundedPlayer = manager.getPlayerFromUsername(player.username());

        if (foundedPlayer != null) {
            Log.info("[" + fleet.getSessionId() + "] " + player.username() + " has been kicked from the session");
            manager.leaveSession(foundedPlayer);
        } else {
            Log.warn("[" + fleet.getSessionId() + "] " + player.username() + " cannot be kicked, not found");
        }

    }

    private void handlePromote(PlayerAction player, boolean master) {
        SessionManager manager = sessionManager;
        Fleet fleet = manager.getFleetByPlayerName(player.username());
        Player foundedPlayer = manager.getPlayerFromUsername(player.username());

        if (foundedPlayer != null) {
            Log.info("[" + fleet.getSessionId() + "] " + player.username() + " has been " + (master ? "promoted" : "demoted"));
            foundedPlayer.setMaster(master);
            sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
        } else {
            Log.warn("[" + fleet.getSessionId() + "] " + player.username() + " cannot be " + (master ? "promoted" : "demoted") + ", not found");
        }
    }

    private void handleClearStatus(Session session) {

        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        fleet.getPlayers().forEach((playerInList) -> {
            playerInList.setReady(false);
        });
        Log.info("[" + fleet.getSessionId() + "] Clearing status of all player");
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    private void handleStartCountdown(Session session) {

        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        fleet.getStats().addTry();

        sqlExecutor.submit(sessionManager::incrementTry);

        Log.info("[" + fleet.getSessionId() + "] Starting countdown in " + SessionSocket.RISE_ANCHOR_TIMER + "s");
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.RUN_COUNTDOWN, SessionSocket.RISE_ANCHOR_TIMER);
        sessionManager.broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    // Extracted method to handle JOIN_SERVER messages
    private void handleJoinServerMessage(Session session, SotServer sotServer) {
        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
        manager.playerJoinSotServer(player, sotServer);
    }

    // Extracted method to handle LEAVE_SERVER messages
    private void handleLeaveServerMessage(Session session, SotServer sotServer) {
        SessionManager manager = sessionManager;
        Player player = manager.getPlayerFromSessionId(session.getId());
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

        // Refuse connection from client with different version
        if (player.getClientVersion() == null || !player.getClientVersion().equalsIgnoreCase(appVersion)) {
            Log.warn("[" + player.getUsername() + "] Client is out of date, connection refused (" + player.getClientVersion() + ")");
            try {
                sessionManager.sendDataToPlayer(session, MessageType.OUTDATED_CLIENT, null);
                session.close();
            } catch (IOException e) {
                throw new RuntimeException(e);
            }
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
            if (fleet != null) {
                player.setSocket(session);
                sessionManager.broadcastDataToSession(newSessionId, MessageType.UPDATE, fleet);
            }
        } else {
            Fleet fleet = manager.joinSession(sessionId, player);
            if (fleet != null) {
                player.setSocket(session);
                sessionManager.broadcastDataToSession(sessionId, MessageType.UPDATE, fleet);
            }
        }
    }

    private void handleUpdateMessage(Player player) {
        SessionManager manager = sessionManager;
        Fleet fleet = manager.getFleetFromId(player.getSessionId());
        assert fleet != null;
        Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());

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
