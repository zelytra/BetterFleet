package fr.zelytra.session;

import fr.zelytra.session.client.BetterFleetClient;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.player.PlayerAction;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.security.SocketSecurityEntity;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.DeploymentException;
import jakarta.websocket.EncodeException;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.io.IOException;
import java.net.URI;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;

@QuarkusTest
class SessionSocketTest {

    @ConfigProperty(name = "app.version")
    List<String> appVersion;

    @TestHTTPResource("/sessions/sessionId")
    URI websocketEndpoint;

    @InjectMock
    ExecutorService executorService;

    @Inject
    SessionManager sessionManager;

    private BetterFleetClient betterFleetClient;
    private URI uri;

    @BeforeEach
    void setup() throws URISyntaxException, DeploymentException, IOException {
        Mockito.doReturn(null).when(executorService).submit(any(Runnable.class));
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        this.uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + socketSecurity.getKey() + "/");
        betterFleetClient = new BetterFleetClient();
        ContainerProvider.getWebSocketContainer().connectToServer(betterFleetClient, uri);
    }

    @AfterEach
    void tearDown() {
        // The SessionManager is an application-scoped singleton shared across every test method,
        // so clear any residual sessions to keep global session-count assertions deterministic
        // regardless of method ordering or lingering websocket connections.
        sessionManager.getSessions().clear();
    }

    @Test
    void stressTest() throws IOException, InterruptedException, EncodeException, DeploymentException, URISyntaxException {
        List<Player> fakePlayers = generateFakePlayer(50);
        String fleetId = "";
        for (Player player : fakePlayers) {

            BetterFleetClient playerClient = new BetterFleetClient();
            SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
            URI uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + socketSecurity.getKey() + "/" + fleetId);

            ContainerProvider.getWebSocketContainer().connectToServer(playerClient, uri);
            playerClient.sendMessage(MessageType.CONNECT, player);

            assertTrue(playerClient.getLatch().await(1, TimeUnit.SECONDS));
            Fleet socketMessage = playerClient.getMessageReceived(Fleet.class);
            assertNotNull(socketMessage);

            if (fleetId.isEmpty()) {
                fleetId = socketMessage.getSessionId();
            }
        }
        assertEquals(fakePlayers.size(), sessionManager.getSessions().get(fleetId).getPlayers().size());
        for (Player player : fakePlayers) {
            sessionManager.leaveSession(player);
        }
        assertNull(sessionManager.getSessions().get(fleetId),"The session should be disbanded");
    }

    @Test
    void onOpen_PlayerConnect_PlayerNotInitialize() throws InterruptedException {
        assertTrue(betterFleetClient.getLatch().await(2, TimeUnit.SECONDS));
        assertEquals(0, SessionSocket.sessionTimeoutTasks.size());
    }

    @Test
    void onOpen_PlayerSetReady_ReadyTrue() throws IOException, InterruptedException, EncodeException {
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));
        player.setReady(false);

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        String sessionId = betterFleetClient.getMessageReceived(Fleet.class).getSessionId();
        player.setSessionId(sessionId);

        player.setReady(true);
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.UPDATE, player);

        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        Fleet socketMessage = betterFleetClient.getMessageReceived(Fleet.class);
        assertEquals(1, socketMessage.getReadyPlayers().size());
    }

    @Test
    void twoSocketOfSamePlayerTryToCreateSession_FirstSessionClosesSecondCreated() throws Exception {
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));
        player.setReady(false);

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        String sessionId = betterFleetClient.getMessageReceived(Fleet.class).getSessionId();
        player.setSessionId(sessionId);

        BetterFleetClient playerClient = new BetterFleetClient();
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        URI uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + socketSecurity.getKey() + "/");

        ContainerProvider.getWebSocketContainer().connectToServer(playerClient, uri);
        playerClient.sendMessage(MessageType.CONNECT, player);

        assertTrue(playerClient.getLatch().await(1, TimeUnit.SECONDS));
        Fleet socketMessage = playerClient.getMessageReceived(Fleet.class);
        assertNotNull(socketMessage);

        assertEquals(1, sessionManager.getSessions().size());
    }

    @Test
    void playerWithNoUsernameTryToConnect() throws Exception {
        Player player = new Player();
        player.setUsername(null);
        player.setClientVersion(appVersion.get(0));
        player.setReady(false);

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertFalse(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        Player player2 = new Player();
        player2.setUsername("Player 1");
        player2.setClientVersion(appVersion.get(0));
        player2.setReady(false);

        BetterFleetClient playerClient = new BetterFleetClient();
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        URI uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + socketSecurity.getKey() + "/");
        ContainerProvider.getWebSocketContainer().connectToServer(playerClient, uri);
        playerClient.sendMessage(MessageType.CONNECT, player2);
        assertTrue(playerClient.getLatch().await(1, TimeUnit.SECONDS));

        assertEquals(1, sessionManager.getSessions().size());
    }

    @Test
    void playerConnectToNullSession() throws Exception {
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));
        player.setReady(false);

        BetterFleetClient playerClient = new BetterFleetClient();
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        URI uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + socketSecurity.getKey() + "/ABCDEF");

        ContainerProvider.getWebSocketContainer().connectToServer(playerClient, uri);
        playerClient.sendMessage(MessageType.CONNECT, player);

        assertTrue(playerClient.getLatch().await(1, TimeUnit.SECONDS));
        assertEquals(0, sessionManager.getSessions().size());
    }

    @Test
    void sameAccountJoiningSameSession_secondConnectionRefusedAndSessionSurvives() throws Exception {
        // End-to-end regression test for issue #436.
        Player player = new Player();
        player.setUsername("Dupe");
        player.setClientVersion(appVersion.get(0));

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        String sessionId = betterFleetClient.getMessageReceived(Fleet.class).getSessionId();

        // A second socket on the same account joins the SAME session id.
        BetterFleetClient secondClient = new BetterFleetClient();
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        URI dupeUri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort()
                + "/sessions/" + socketSecurity.getKey() + "/" + sessionId);
        ContainerProvider.getWebSocketContainer().connectToServer(secondClient, dupeUri);

        Player duplicate = new Player();
        duplicate.setUsername("Dupe");
        duplicate.setClientVersion(appVersion.get(0));
        secondClient.sendMessage(MessageType.CONNECT, duplicate);

        // The duplicate is refused and its socket closed (latch trips on the refusal/close).
        assertTrue(secondClient.getLatch().await(2, TimeUnit.SECONDS));

        Fleet fleet = sessionManager.getSessions().get(sessionId);
        assertNotNull(fleet, "The original session must survive a duplicate join (issue #436)");
        assertEquals(1, fleet.getPlayers().size(), "The duplicate account must not be added to the fleet");
    }

    @Test
    void nonMasterCannotKickAnotherPlayer() throws Exception {
        String sessionId = createSessionAsMaster("Master");
        BetterFleetClient memberClient = connectMember("Member", sessionId);

        Player member = new Player();
        member.setUsername("Member");
        member.setClientVersion(appVersion.get(0));
        member.setSessionId(sessionId);

        // The non-master tries to kick the master, then sends a benign UPDATE. Messages on a
        // single socket are processed in order, so once the UPDATE round-trips the (ignored)
        // kick has already been handled.
        memberClient.setLatch(new CountDownLatch(1));
        memberClient.sendMessage(MessageType.KICK_PLAYER, new PlayerAction("Master", sessionId));
        memberClient.sendMessage(MessageType.UPDATE, member);
        assertTrue(memberClient.getLatch().await(1, TimeUnit.SECONDS));

        Fleet fleet = sessionManager.getSessions().get(sessionId);
        assertNotNull(fleet);
        assertNotNull(fleet.getPlayerFromUsername("Master"), "A non-master must not be able to kick the master");
        assertEquals(2, fleet.getPlayers().size(), "Both players must still be present");
    }

    @Test
    void nonMasterCannotPromoteThemselves() throws Exception {
        String sessionId = createSessionAsMaster("Master");
        BetterFleetClient memberClient = connectMember("Member", sessionId);

        Player member = new Player();
        member.setUsername("Member");
        member.setClientVersion(appVersion.get(0));
        member.setSessionId(sessionId);

        memberClient.setLatch(new CountDownLatch(1));
        memberClient.sendMessage(MessageType.PROMOTE_PLAYER, new PlayerAction("Member", sessionId));
        memberClient.sendMessage(MessageType.UPDATE, member);
        assertTrue(memberClient.getLatch().await(1, TimeUnit.SECONDS));

        Fleet fleet = sessionManager.getSessions().get(sessionId);
        assertNotNull(fleet);
        assertFalse(fleet.getPlayerFromUsername("Member").isMaster(), "A non-master must not be able to promote itself");
    }

    @Test
    void masterCanKickMember() throws Exception {
        String sessionId = createSessionAsMaster("Master");
        connectMember("Member", sessionId);

        // The master kicks the member; leaveSession broadcasts an UPDATE back to the master.
        betterFleetClient.sendMessage(MessageType.KICK_PLAYER, new PlayerAction("Member", sessionId));

        awaitCondition(() -> {
            Fleet f = sessionManager.getSessions().get(sessionId);
            return f != null && f.getPlayerFromUsername("Member") == null;
        }, 2000);

        Fleet fleet = sessionManager.getSessions().get(sessionId);
        assertNotNull(fleet);
        assertNull(fleet.getPlayerFromUsername("Member"), "The master must be able to kick a member");
        assertEquals(1, fleet.getPlayers().size(), "Only the master should remain");
    }

    private String createSessionAsMaster(String username) throws Exception {
        Player master = new Player();
        master.setUsername(username);
        master.setClientVersion(appVersion.get(0));
        betterFleetClient.sendMessage(MessageType.CONNECT, master);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        return betterFleetClient.getMessageReceived(Fleet.class).getSessionId();
    }

    private BetterFleetClient connectMember(String username, String sessionId) throws Exception {
        BetterFleetClient client = new BetterFleetClient();
        SocketSecurityEntity socketSecurity = new SocketSecurityEntity();
        URI memberUri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort()
                + "/sessions/" + socketSecurity.getKey() + "/" + sessionId);
        ContainerProvider.getWebSocketContainer().connectToServer(client, memberUri);

        Player member = new Player();
        member.setUsername(username);
        member.setClientVersion(appVersion.get(0));
        client.sendMessage(MessageType.CONNECT, member);
        assertTrue(client.getLatch().await(1, TimeUnit.SECONDS));
        return client;
    }

    private static void awaitCondition(java.util.function.BooleanSupplier condition, long timeoutMillis) throws InterruptedException {
        long deadline = System.currentTimeMillis() + timeoutMillis;
        while (System.currentTimeMillis() < deadline) {
            if (condition.getAsBoolean()) {
                return;
            }
            Thread.sleep(20);
        }
    }

    private List<Player> generateFakePlayer(int amount) {
        List<Player> fakePlayer = new ArrayList<>();
        for (int x = 0; x < amount; x++) {
            Player player = new Player();
            player.setUsername("Player " + x);
            player.setClientVersion(appVersion.get(0));
            fakePlayer.add(player);
        }
        return fakePlayer;
    }
}



