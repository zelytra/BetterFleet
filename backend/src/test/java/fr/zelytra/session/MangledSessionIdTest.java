package fr.zelytra.session;

import fr.zelytra.session.client.BetterFleetClient;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.security.SocketSecurityEntity;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.inject.Inject;
import jakarta.websocket.ContainerProvider;
import jakarta.websocket.Session;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.net.URI;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * The mangled-id lockout of #888: a player's client cached a join code with a stray leading
 * space, the browser percent-encoded it into the socket path, and the id reached the backend as
 * the LITERAL {@code %20DE41082} - path parameters arrive undecoded. The exact map lookup then
 * answered SESSION_NOT_FOUND six times in a row for a session that was alive the entire time.
 * <p>
 * Session ids are seven uppercase hex characters, so decoding, trimming and upper-casing can
 * never turn a valid id into a different valid one: normalising is free of false positives.
 */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
class MangledSessionIdTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @InjectMock
    ExecutorService executorService;

    @Inject
    SessionManager sessionManager;

    @ConfigProperty(name = "app.version")
    List<String> appVersion;

    @TestHTTPResource("/sessions/sessionId")
    URI websocketEndpoint;

    @BeforeEach
    void setUp() {
        sessionManager.proxyCheckAPI = Mockito.mock(ProxyCheckAPI.class);
        when(sessionManager.proxyCheckAPI.resolveGeo(Mockito.any()))
                .thenReturn(new ProxyCheckAPI.Geo("", ""));
    }

    private Player member(String username) {
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn("sock-" + username);
        when(socket.isOpen()).thenReturn(true);
        Player player = new Player();
        player.setUsername(username);
        player.setSocket(socket);
        return player;
    }

    @Test
    void aPercentEncodedSpaceInFrontOfTheIdStillFindsTheSession() {
        Fleet live = sessionManager.createSession(member("sosun"));

        assertSame(live, sessionManager.getFleetFromId("%20" + live.getSessionId()),
                "the literal %20 the socket path delivers must not hide a live session");
        assertTrue(sessionManager.isSessionExist("%20" + live.getSessionId()));
    }

    @Test
    void whitespaceAndCaseAroundTheIdAreForgiven() {
        Fleet live = sessionManager.createSession(member("sosun"));
        String mangled = "  " + live.getSessionId().toLowerCase() + " ";

        assertSame(live, sessionManager.getFleetFromId(mangled));
    }

    @Test
    void theRealSocketPathJoinsWithTheMangledId() throws Exception {
        // End to end, as production saw it: the id in the URL path carries the encoded space.
        Fleet live = sessionManager.createSession(member("sosun"));

        BetterFleetClient client = new BetterFleetClient();
        SocketSecurityEntity token = new SocketSecurityEntity();
        URI uri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort()
                + "/sessions/" + token.getKey() + "/%20" + live.getSessionId());
        ContainerProvider.getWebSocketContainer().connectToServer(client, uri);

        Player rayharley = new Player();
        rayharley.setUsername("rayharley");
        rayharley.setClientVersion(appVersion.get(0));
        client.sendMessage(MessageType.CONNECT, rayharley);

        assertTrue(client.getLatch().await(2, TimeUnit.SECONDS), "the join must be answered");
        Fleet joined = client.getMessageReceived(Fleet.class);
        assertNotNull(joined, "a live session must answer a join, not SESSION_NOT_FOUND");
        assertEquals(live.getSessionId(), joined.getSessionId());
        assertEquals(2, sessionManager.getFleetFromId(live.getSessionId()).getPlayers().size(),
                "rayharley must be IN the session, not locked out of it");
    }
}
