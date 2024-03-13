package fr.zelytra.session;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.util.concurrent.*;

@ServerEndpoint("/sessions/{sessionId}") // WebSocket endpoint
@ApplicationScoped
public class SessionSocket {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();
    private static final int RISE_ANCHOR_TIMER = 3; // in seconds

    @ConfigProperty(name = "app.version")
    String appVersion;

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
                TimeUnit.SECONDS.sleep(10); // for example, 10 seconds timeout
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
    public void onMessage(String message, Session session, @PathParam("sessionId") String sessionId) throws IOException {

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
                handleConnectMessage(player, session, sessionId);
            }
            case UPDATE -> {
                Player player = objectMapper.convertValue(socketMessage.data(), Player.class);
                handleLeaveMessage(player);
            }
            case START_COUNTDOWN -> handleStartCountdown(session);
            case CLEAR_STATUS -> handleClearStatus(session);
            case KEEP_ALIVE -> {
            }
            case JOIN_SERVER -> {
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
    private void handleConnectMessage(Player player, Session session, String sessionId) {
        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

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
        player.setSocket(session);

        Log.info("[" + player.getUsername() + "] Connected !");

        //Create session if no id provided
        if (sessionId == null || sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            Fleet fleet = manager.joinSession(newSessionId, player);
            player.setMaster(true);
            if (fleet != null) {
                sessionManager.broadcastDataToSession(newSessionId, MessageType.UPDATE, fleet);
            }
        } else {
            Fleet fleet = manager.joinSession(sessionId, player);
            if (fleet != null) {
                sessionManager.broadcastDataToSession(sessionId, MessageType.UPDATE, fleet);
            }
        }
    }

    // Extracted method to handle LEAVE messages
    private void handleLeaveMessage(Player player) {
        SessionManager manager = sessionManager;
        Fleet fleet = manager.getFleetFromId(player.getSessionId());
        assert fleet != null;
        Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());

        foundedplayer.setReady(player.isReady());
        foundedplayer.setStatus(player.getStatus());

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
}
