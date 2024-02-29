package fr.zelytra.session;

import fr.zelytra.session.fleet.Player;
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
        Log.info("[" + session.getId() + "] Connecting...");

    }

    @OnMessage
    public void onMessage(String message, Session session, @PathParam("sessionId") String sessionId) {

        Log.info("Received message from client: " + message);

        // Cancel the timeout task since we've received the message
        Future<?> timeoutTask = sessionTimeoutTasks.remove(session.getId());
        if (timeoutTask != null) {
            timeoutTask.cancel(true);
        }

        //TODO Handle player connection to fleet
        Log.info("[" + session.getId() + "] Connected !");
    }

    @OnClose
    public void onClose(Session session) {
        // Clean up resources related to the session
        sessionTimeoutTasks.remove(session.getId());
        Log.info("[" + session.getId() + "] Disconnected");
    }

    @OnError
    public void onError(Session session, Throwable throwable) {
        Log.error("WebSocket error for session " + session.getId() + ": " + throwable.getMessage());
    }
}
