package fr.zelytra.session;

import fr.zelytra.session.client.BetterFleetClient;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.socket.MessageType;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.DeploymentException;
import jakarta.websocket.EncodeException;
import org.eclipse.microprofile.config.inject.ConfigProperty;
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
    String appVersion;

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
        String sessionId = sessionManager.createSession();
        this.uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort() + "/sessions/" + sessionId);
        betterFleetClient = new BetterFleetClient();
        ContainerProvider.getWebSocketContainer().connectToServer(betterFleetClient, uri);
    }

    @Test
    void onOpen_PlayerConnect_PlayerShouldNotBeInTheTimeOutList() throws IOException, InterruptedException, EncodeException {
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion);
        betterFleetClient.sendMessage(MessageType.CONNECT, player);

        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        assertEquals(1, SessionSocket.sessionTimeoutTasks.size());
    }

    @Test
    void stressTest() throws IOException, InterruptedException, EncodeException, DeploymentException {
        List<Player> fakePlayers = generateFakePlayer(50);
        String fleetId = "";
        for (Player player : fakePlayers) {

            BetterFleetClient playerClient = new BetterFleetClient();
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
        player.setClientVersion(appVersion);
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

    private List<Player> generateFakePlayer(int amount) {
        List<Player> fakePlayer = new ArrayList<>();
        for (int x = 0; x < amount; x++) {
            Player player = new Player();
            player.setUsername("Player " + x);
            player.setClientVersion(appVersion);
            fakePlayer.add(player);
        }
        return fakePlayer;
    }
}



