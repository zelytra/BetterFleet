package fr.zelytra.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.Player;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;

import java.io.IOException;
import java.util.Objects;
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

        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
        objectMapper.enable(MapperFeature.ACCEPT_CASE_INSENSITIVE_ENUMS);

        Player player = objectMapper.readValue(message, Player.class);
        player.setSocket(session);

        SessionManager manager = SessionManager.getInstance();

        //Check if it's an update player request
        if (manager.isPlayerInSession(player, player.getSessionId())) {

            Fleet fleet = manager.getFleetFromId(player.getSessionId());
            assert fleet != null;
            Player foundedplayer = fleet.getPlayerFromUsername(player.getUsername());

            foundedplayer.setReady(player.isReady());
            foundedplayer.setStatus(player.getStatus());

            broadcastSessionUpdate(player.getSessionId().toUpperCase());

            Log.info("[" + player.getUsername() + "] Data updated for session !");
            return;
        }

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

        // Send to all players the Fleet data
        ObjectMapper objectMapper = new ObjectMapper();
        String json;
        try {
            json = objectMapper.writeValueAsString(fleet);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }

        for (Player player : fleet.getPlayers()) {
            player.getSocket().getAsyncRemote().sendText(json, result -> {
                if (result.getException() != null) {
                    System.out.println("Unable to send message: " + result.getException());
                }
            });
        }
    }
}
