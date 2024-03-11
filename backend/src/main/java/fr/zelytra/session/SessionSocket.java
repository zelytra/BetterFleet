package fr.zelytra.session;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.SocketMessage;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;

import java.io.IOException;
import java.util.TimeZone;
import java.util.concurrent.*;

@ServerEndpoint("/sessions/{sessionId}") // WebSocket endpoint
@ApplicationScoped
public class SessionSocket {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ConcurrentHashMap<String, Future<?>> sessionTimeoutTasks = new ConcurrentHashMap<>();
    private static final int RISE_ANCHOR_TIMER = 3; // in seconds

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

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        fleet.getPlayers().forEach((playerInList) -> {
            playerInList.setReady(false);
        });
        Log.info("[" + fleet.getSessionId() + "] Clearing status of all player");
        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    private void handleStartCountdown(Session session) {

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        Fleet fleet = manager.getFleetByPlayerName(player.getUsername());
        fleet.getStats().addTry();

        Log.info("[" + fleet.getSessionId() + "] Starting countdown in " + SessionSocket.RISE_ANCHOR_TIMER + "s");
        broadcastDataToSession(fleet.getSessionId(), MessageType.RUN_COUNTDOWN, SessionSocket.RISE_ANCHOR_TIMER);
        broadcastDataToSession(fleet.getSessionId(), MessageType.UPDATE, fleet);
    }

    // Extracted method to handle JOIN_SERVER messages
    private void handleJoinServerMessage(Session session, SotServer sotServer) {
        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        manager.playerJoinSotServer(player, sotServer);
    }

    // Extracted method to handle LEAVE_SERVER messages
    private void handleLeaveServerMessage(Session session, SotServer sotServer) {
        SessionManager manager = SessionManager.getInstance();
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

        session.setMaxIdleTimeout(3600000); // 1h of timeout

        SessionManager manager = SessionManager.getInstance();
        player.setSocket(session);

        Log.info("[" + player.getUsername() + "] Connected !");

        //Create session if no id provided
        if (sessionId == null || sessionId.isEmpty()) {
            String newSessionId = manager.createSession();
            Fleet fleet = manager.joinSession(newSessionId, player);
            player.setMaster(true);
            broadcastDataToSession(newSessionId, MessageType.UPDATE, fleet);
        } else {
            Fleet fleet = manager.joinSession(sessionId, player);
            broadcastDataToSession(sessionId, MessageType.UPDATE, fleet);
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

        broadcastDataToSession(player.getSessionId(), MessageType.UPDATE, fleet);

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

        SessionManager manager = SessionManager.getInstance();
        Player player = manager.getPlayerFromSessionId(session.getId());
        if (player != null) {
            manager.leaveSession(player);
            Log.info("[" + player.getUsername() + "] Disconnected");
        } else {
            Log.warn("[UNDEFINED PLAYER] Disconnected");
        }
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
    public static <T> void broadcastDataToSession(String sessionId, MessageType messageType, T data) {
        SessionManager manager = SessionManager.getInstance();

        if (!manager.isSessionExist(sessionId)) {
            Log.info("[" + sessionId + "] Failed to broadcast, session not found");
            return;
        }
        Fleet fleet = manager.getFleetFromId(sessionId);
        assert fleet != null;

        SocketMessage<T> message = new SocketMessage<>(messageType, data);

        // Send to all players the Countdown data
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

        for (Player player : fleet.getPlayers()) {
            player.getSocket().getAsyncRemote().sendText(json, result -> {
                if (result.getException() != null) {
                    Log.error("Unable to send message: " + result.getException());
                }
            });
        }
    }


}
