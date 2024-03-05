package fr.zelytra.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.Player;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;

import java.io.IOException;
import java.util.concurrent.*;

@ServerEndpoint("/sessions/{sessionId}") // WebSocket endpoint
@ApplicationScoped
public class SessionSocket {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();

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
    public void onMessage(String message, Session session, @PathParam("sessionId") String sessionId) throws JsonProcessingException {

        ObjectMapper objectMapper = new ObjectMapper();
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
            default -> Log.info("Unhandled message type: " + socketMessage.messageType());
        }
    }

    // Extracted method to handle CONNECT messages
    private void handleConnectMessage(Player player, Session session, String sessionId) {
        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        SessionManager manager = SessionManager.getInstance();
        player.setSocket(session);

        Log.info("[" + player.getUsername() + "] Connected !");

        //Create session if no id provided
        if (sessionId == null || sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            manager.joinSession(newSessionId, player);
            player.setMaster(true);
            broadcastSessionUpdate(newSessionId);
        } else {
            manager.joinSession(sessionId, player);
            broadcastSessionUpdate(sessionId);
        }


    }

    // Extracted method to handle LEAVE messages
    private void handleLeaveMessage(Player player) {
        SessionManager manager = SessionManager.getInstance();
        Fleet fleet = manager.getFleetFromId(player.getSessionId());
        assert fleet != null;
        Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());

        foundedplayer.setReady(player.isReady());
        foundedplayer.setStatus(player.getStatus());

        broadcastSessionUpdate(player.getSessionId().toUpperCase());

        Log.info("[" + player.getUsername() + "] Data updated for session !");
    }

    @OnClose
    public void onClose(Session session) {

        // Clean up resources related to the session
        sessionTimeoutTasks.remove(session.getId());

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());

        if (player != null) {
            manager.leaveSession(player);
            Log.info("[" + player.getUsername() + "] Disconnected");
            return;
        }
        Log.warn("[UNDEFINED PLAYER] Disconnected");
    }

    @OnError
    public void onError(Session session, Throwable throwable) throws IOException {
        Log.error("WebSocket error for session " + session.getId() + ": " + throwable);

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player != null) {
            manager.leaveSession(player);
        }

        session.close();
    }

    /**
     * @param sessionId Fleet session id
     */
    public static void broadcastSessionUpdate(String sessionId) {
        SessionManager manager = SessionManager.getInstance();

        if (!manager.isSessionExist(sessionId)) {
            Log.info("[" + sessionId + "] Failed to broadcast, session not found");
            return;
        }
        Fleet fleet = manager.getFleetFromId(sessionId);
        assert fleet != null;

        SocketMessage<Fleet> message = new SocketMessage<>(MessageType.UPDATE,fleet);

        // Send to all players the Fleet data
        ObjectMapper objectMapper = new ObjectMapper();
        String json;
        try {
            json = objectMapper.writeValueAsString(message);
        } catch (JsonProcessingException e) {
            throw new Error(e);
        }

        for (Player player : fleet.getPlayers()) {
            player.getSocket().getAsyncRemote().sendText(json, result -> {
                if (result.getException() != null) {
                    Log.error("Unable to send message: " + result.getException());
                }
            });
        }
    }
}
