package fr.zelytra.session;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
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
    public void onMessage(String message, Session session, @PathParam("sessionId") String sessionId) {

        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        Gson gson = new Gson();
        Player player = gson.fromJson(message, Player.class);
        player.setSocket(session);
        Log.info("[" + player.getUsername() + "] Connected !");

        SessionManager manager = SessionManager.getInstance();

        //Create session if no id provided
        if (sessionId != null && sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            manager.joinSession(newSessionId, player);
            //broadcastSessionUpdate(newSessionId);
        } else {
            manager.joinSession(sessionId, player);
        }

        // Broadcast update
        broadcastSessionUpdate(sessionId);

    }

    @OnClose
    public void onClose(Session session) {
        // Clean up resources related to the session
        sessionTimeoutTasks.remove(session.getId());

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());

        if (player != null) {
            manager.leaveSession(player);
        }

        Log.info("[" + player.getUsername() + "] Disconnected");
    }

    @OnError
    public void onError(Session session, Throwable throwable) throws IOException {
        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player != null) {
            manager.leaveSession(player);
        }

        session.close();
        Log.error("WebSocket error for session " + session.getId() + ": " + throwable.getMessage() + "  " + player.getUsername());
    }

    private void broadcastSessionUpdate(String sessionId) {
        Log.info("broadcast");
        SessionManager manager = SessionManager.getInstance();

        if (!manager.isSessionExist(sessionId)) return;
        Log.info("manager exist");
        Fleet fleet = manager.getFleetFromId(sessionId);
        assert fleet != null;

        // Send to all players the Fleet data
        Gson gson = new Gson();
        for (Player player : fleet.getPlayers()) {
            player.getSocket().getAsyncRemote().sendObject(fleet);
        }
    }
}
