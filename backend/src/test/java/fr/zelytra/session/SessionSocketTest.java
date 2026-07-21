package fr.zelytra.session;

import fr.zelytra.session.client.BetterFleetClient;
import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.PublicSession;
import fr.zelytra.session.fleet.PublicSessionsSnapshot;
import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.BoatSize;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.player.PlayerAction;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.session.socket.security.SocketSecurityEntity;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.http.TestHTTPResource;
import io.quarkus.test.junit.QuarkusTest;
import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import io.smallrye.mutiny.subscription.Cancellable;
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
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

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

    @InjectMock
    ProxyCheckAPI proxyCheckAPI;

    @Inject
    SessionManager sessionManager;

    private BetterFleetClient betterFleetClient;
    private URI uri;

    @BeforeEach
    void setup() throws URISyntaxException, DeploymentException, IOException {
        Mockito.doReturn(null).when(executorService).submit(any(Runnable.class));
        // Keep the JOIN_SERVER path offline: no proxycheck.io call, deterministic geo.
        Mockito.when(proxyCheckAPI.resolveGeo(any())).thenReturn(new ProxyCheckAPI.Geo("Test Land", "xx"));
        Mockito.when(proxyCheckAPI.resolveLocation(any())).thenReturn("Test Land");
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
    void updateBoatSize_boatSizeStoredAndBroadcastToFleet() throws IOException, InterruptedException, EncodeException {
        // Covers issue #405: a player's selected boat size must be stored server-side and echoed
        // back on the UPDATE broadcast so it can be rendered next to the player in the lobby.
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        String sessionId = betterFleetClient.getMessageReceived(Fleet.class).getSessionId();
        player.setSessionId(sessionId);

        // The player picks a boat size and spikes (UPDATE)
        player.setBoatSize(BoatSize.BRIGANTINE);
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.UPDATE, player);

        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        Fleet broadcast = betterFleetClient.getMessageReceived(Fleet.class);

        // Present in the broadcast fleet the lobby renders from...
        assertEquals(BoatSize.BRIGANTINE, broadcast.getPlayerFromUsername("Player 1").getBoatSize());
        // ...and stored on the authoritative server-side copy of the player.
        assertEquals(BoatSize.BRIGANTINE, sessionManager.getSessions().get(sessionId).getPlayerFromUsername("Player 1").getBoatSize());
    }

    @Test
    void updateBoatSize_canBeEditedAfterInitialSelection() throws IOException, InterruptedException, EncodeException {
        // Covers issue #405: the boat size must remain editable after the initial spike.
        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        String sessionId = betterFleetClient.getMessageReceived(Fleet.class).getSessionId();
        player.setSessionId(sessionId);

        // Initial selection
        player.setBoatSize(BoatSize.SLOOP);
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.UPDATE, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        assertEquals(BoatSize.SLOOP, betterFleetClient.getMessageReceived(Fleet.class).getPlayerFromUsername("Player 1").getBoatSize());

        // Edit the selection to a different boat size
        player.setBoatSize(BoatSize.GALLEON);
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.UPDATE, player);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        Fleet broadcast = betterFleetClient.getMessageReceived(Fleet.class);
        assertEquals(BoatSize.GALLEON, broadcast.getPlayerFromUsername("Player 1").getBoatSize());
        assertEquals(BoatSize.GALLEON, sessionManager.getSessions().get(sessionId).getPlayerFromUsername("Player 1").getBoatSize());
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

    @Test
    void outdatedClient_connectionRefusedAndNoSessionCreated() throws Exception {
        Player player = new Player();
        player.setUsername("OldClient");
        player.setClientVersion("0.0.0-unsupported"); // not part of app.version

        betterFleetClient.sendMessage(MessageType.CONNECT, player);
        // The server answers OUTDATED_CLIENT and closes the socket, tripping the latch.
        assertTrue(betterFleetClient.getLatch().await(2, TimeUnit.SECONDS));

        assertTrue(sessionManager.getSessions().isEmpty(), "No session must be created for an outdated client");
    }

    @Test
    void invalidToken_connectionRefusedAndNoSessionCreated() throws Exception {
        BetterFleetClient client = new BetterFleetClient();
        URI badUri = new URI("ws://" + websocketEndpoint.getHost() + ":" + websocketEndpoint.getPort()
                + "/sessions/not-a-registered-token/");
        ContainerProvider.getWebSocketContainer().connectToServer(client, badUri);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setClientVersion(appVersion.get(0));
        client.sendMessage(MessageType.CONNECT, player);

        // The server answers CONNECTION_REFUSED and closes the socket, tripping the latch.
        assertTrue(client.getLatch().await(2, TimeUnit.SECONDS));

        assertTrue(sessionManager.getSessions().isEmpty(), "No session must be created with an invalid token");
    }

    @Test
    void joinServer_broadcastGroupsThePlayerUnderTheDetectedServer() throws Exception {
        String sessionId = createSessionAsMaster("Sailor");

        // "Mock the game": the client reports the server the Rust detection layer found.
        Fleet broadcast = joinServer("1.1.1.1", 30101);

        assertEquals(1, broadcast.getServers().size(), "The detected server must appear in the fleet");
        assertTrue(onlyServerHolds(broadcast, "Sailor"),
                "The player must be grouped under the server they joined");
        // The server-side truth mirrors the broadcast the lobby renders from.
        assertEquals(1, sessionManager.getSessions().get(sessionId).getServers().size());
    }

    @Test
    void payloadLessLeaveServer_isIgnoredInsteadOfKickingThePlayer() throws Exception {
        // A client that quits the game before the server identity resolved sends LEAVE_SERVER with
        // no data (nothing was ever joined). This used to NPE in playerLeaveSotServer, and the
        // exception reached @OnError which closed the socket — ejecting the player from their whole
        // fleet session for merely backing out of a game.
        String sessionId = createSessionAsMaster("Sailor");

        betterFleetClient.sendMessage(MessageType.LEAVE_SERVER, null);
        betterFleetClient.sendMessage(MessageType.JOIN_SERVER, null);

        // The socket must have survived both: a real action still round-trips...
        Fleet broadcast = joinServer("1.1.1.1", 30101);
        assertTrue(onlyServerHolds(broadcast, "Sailor"),
                "The player must still be connected and able to join a server");
        // ...and the player was never ejected from the session.
        assertEquals(1, sessionManager.getSessions().get(sessionId).getPlayers().size(),
                "The payload-less message must not cost the player their session");
    }

    @Test
    void joinServer_fillsInTheLocationAfterwards() throws Exception {
        // The geolocation runs on a worker and is broadcast once it lands, so the join itself never
        // waits on proxycheck.io. The location therefore shows up a moment after the server does.
        String sessionId = createSessionAsMaster("Sailor");

        joinServer("1.1.1.1", 30101);

        awaitCondition(() -> !locationOf(sessionId).isEmpty(), 2000);
        assertEquals("Test Land", locationOf(sessionId),
                "The resolved geolocation must land on the server without anyone rejoining");
    }

    @Test
    void failedGeolocation_isNotCachedSoTheNextJoinRetries() throws Exception {
        // The production bug: a timed-out lookup was cached as an empty geo under the server's hash,
        // so every later join hit that entry and the server stayed location-less for the lifetime of
        // the process — "some players have no location for their server", forever. The country code
        // went the same way, which is why those sessions never grew a flag in the browser either.
        Mockito.when(proxyCheckAPI.resolveGeo(any())).thenReturn(ProxyCheckAPI.Geo.EMPTY); // timing out
        String sessionId = createSessionAsMaster("Sailor");

        joinServer("3.3.3.3", 30101);
        awaitCondition(() -> !locationOf(sessionId).isEmpty(), 300); // give the failing lookup time
        assertEquals("", locationOf(sessionId), "A failed lookup cannot invent a location");

        // proxycheck.io comes back, and a later join resolves it — which a cached failure blocked.
        Mockito.when(proxyCheckAPI.resolveGeo(any()))
                .thenReturn(new ProxyCheckAPI.Geo("Recovered Land", "fr"));
        joinServer("3.3.3.3", 30101);

        awaitCondition(() -> !locationOf(sessionId).isEmpty(), 2000);
        assertEquals("Recovered Land", locationOf(sessionId),
                "A failure must not be cached: the next join has to retry the lookup");
        assertEquals("fr", countryCodeOf(sessionId),
                "The retry must recover the country code too — that is what the browser's flag needs");
    }

    /**
     * The country code the session's one and only server currently carries, server-side.
     */
    private String countryCodeOf(String sessionId) {
        return sessionManager.getSessions().get(sessionId).getServers()
                .values().iterator().next().getCountryCode();
    }

    /**
     * The location the session's one and only server currently carries, server-side.
     */
    private String locationOf(String sessionId) {
        return sessionManager.getSessions().get(sessionId).getServers()
                .values().iterator().next().getLocation();
    }

    @Test
    void switchServer_leaveThenJoin_leavesNoDuplicateInTheOldServer() throws Exception {
        // Reproduces the switch that showed a player twice: leave the old server, then join the
        // new one (the exact sequence the client now performs). The player must end up in
        // exactly one server, and the emptied old server must be gone.
        String sessionId = createSessionAsMaster("Sailor");

        joinServer("1.1.1.1", 30101); // detected on server A
        leaveServer("1.1.1.1", 30101); // back to menu / handing off
        Fleet broadcast = joinServer("2.2.2.2", 31000); // detected on server B

        assertEquals(1, broadcast.getServers().size(), "The player must be in exactly one server, not two");
        assertTrue(onlyServerHolds(broadcast, "Sailor"), "The player must be grouped only under the new server");
        assertEquals(1, sessionManager.getSessions().get(sessionId).getServers().size(),
                "The emptied server must be removed");
    }

    @Test
    void playerDisconnect_removedFromTheFleet_noGhostLeftBehind() throws Exception {
        // Ghost-session guard: when a member's socket drops, they must not linger in the fleet.
        String sessionId = createSessionAsMaster("Master");
        BetterFleetClient memberClient = connectMember("Member", sessionId);
        assertEquals(2, sessionManager.getSessions().get(sessionId).getPlayers().size());

        memberClient.getSession().close();

        awaitCondition(() -> {
            Fleet f = sessionManager.getSessions().get(sessionId);
            return f != null && f.getPlayerFromUsername("Member") == null;
        }, 2000);

        Fleet fleet = sessionManager.getSessions().get(sessionId);
        assertNotNull(fleet, "The session must survive one member leaving");
        assertNull(fleet.getPlayerFromUsername("Member"), "The disconnected member must not linger as a ghost");
        assertEquals(1, fleet.getPlayers().size(), "Only the still-connected master should remain");
    }

    @Test
    void newSession_defaultsToPrivate() throws Exception {
        // A freshly created session must be unlisted by default; going public is an explicit opt-in.
        String sessionId = createSessionAsMaster("Host");
        assertTrue(sessionManager.getSessions().get(sessionId).isPrivate(),
                "A new session must default to private (unlisted)");
    }

    @Test
    void masterCanToggleSessionToPublic() throws Exception {
        String sessionId = createSessionAsMaster("Host");

        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, false); // false = public
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        Fleet broadcast = betterFleetClient.getMessageReceived(Fleet.class);
        assertFalse(broadcast.isPrivate(), "The broadcast fleet must reflect the new public visibility");
        assertFalse(sessionManager.getSessions().get(sessionId).isPrivate(),
                "The authoritative session must be public after the master toggles it");
    }

    @Test
    void nonMasterCannotChangeVisibility() throws Exception {
        String sessionId = createSessionAsMaster("Master");
        BetterFleetClient memberClient = connectMember("Member", sessionId);

        Player member = new Player();
        member.setUsername("Member");
        member.setClientVersion(appVersion.get(0));
        member.setSessionId(sessionId);

        // The member tries to make the session public, then sends a benign UPDATE. Messages on one
        // socket are processed in order, so once the UPDATE round-trips the (ignored) toggle is done.
        memberClient.setLatch(new CountDownLatch(1));
        memberClient.sendMessage(MessageType.SET_VISIBILITY, false);
        memberClient.sendMessage(MessageType.UPDATE, member);
        assertTrue(memberClient.getLatch().await(1, TimeUnit.SECONDS));

        assertTrue(sessionManager.getSessions().get(sessionId).isPrivate(),
                "A non-master must not be able to change the session visibility");
    }

    @Test
    void createSession_seedsBannerFromHostPreference() throws Exception {
        // The host's chosen banner (a preference sent on CONNECT) is copied onto the session and
        // broadcast so every member — and the public browser — renders the same banner.
        Player host = new Player();
        host.setUsername("Host");
        host.setClientVersion(appVersion.get(0));
        host.setBanner(2);

        betterFleetClient.sendMessage(MessageType.CONNECT, host);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        Fleet broadcast = betterFleetClient.getMessageReceived(Fleet.class);

        assertEquals(2, broadcast.getBanner(), "The session banner must be seeded from the host's preference");
        assertEquals(2, sessionManager.getSessions().get(broadcast.getSessionId()).getBanner());
    }

    /**
     * The browser's list is supposed to be live: creating, closing or flipping a session to private
     * has to push a fresh snapshot down the SSE.
     */
    @Test
    void directoryStream_pushesASnapshotOnEveryChange() throws Exception {
        List<PublicSessionsSnapshot> received = new CopyOnWriteArrayList<>();
        Cancellable subscription = sessionManager.streamPublicSessions()
                .subscribe().with(received::add, failure -> received.clear());
        try {
            // A subscriber gets the current state immediately, without asking for it.
            awaitCondition(() -> !received.isEmpty(), 1000);
            assertFalse(received.isEmpty(), "Subscribing must deliver the current snapshot");
            int afterSubscribe = received.size();

            createSessionAsMaster("Host");
            awaitCondition(() -> received.size() > afterSubscribe, 1000);
            assertTrue(received.size() > afterSubscribe, "Creating a session must push a snapshot");
            int afterCreate = received.size();
            assertEquals(1, received.get(received.size() - 1).sessions().size(),
                    "The pushed snapshot must contain the new session");

            betterFleetClient.setLatch(new CountDownLatch(1));
            betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, false);
            assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
            awaitCondition(() -> received.size() > afterCreate, 1000);
            assertTrue(received.size() > afterCreate, "Going public must push a snapshot");
            assertFalse(received.get(received.size() - 1).sessions().get(0).isPrivate(),
                    "The pushed snapshot must carry the new visibility");
        } finally {
            subscription.cancel();
        }
    }

    @Test
    void directoryStream_survivesAViewerThatIsNotAskingForEvents() throws Exception {
        // Reported from production: one player watches the public sessions browser, another creates
        // a public session, and a BackPressureFailure lands in the logs.
        //
        // A subscriber is regularly between requests — an SSE serializer asks for one event at a
        // time — and BroadcastProcessor answers an emission it cannot deliver by *terminating that
        // subscriber*. So the viewer's stream died the moment anyone else touched a session, and
        // their list silently froze until they pressed Refresh. (The emitting player is unaffected:
        // the failure travels to the subscriber, it does not come back up publishDirectoryChange.)
        //
        // The demand is the whole point: subscribing with unbounded demand — which the plain
        // .subscribe().with() in the test above does — never reproduces this. It takes a subscriber
        // that stops asking, like the real one.
        AssertSubscriber<PublicSessionsSnapshot> viewer = watchingViewer();

        sessionManager.publishDirectoryChange(); // another player changes something, viewer idle

        // The failure travels to the subscriber asynchronously, so give it a window to arrive before
        // concluding that it did not — checking immediately passes even against the broken code.
        awaitCondition(() -> viewer.getFailure() != null, 500);

        assertNull(viewer.getFailure(),
                "A viewer that is not currently asking for events must not have its stream killed");
        viewer.assertNotTerminated();
        viewer.cancel();
    }

    @Test
    void directoryStream_aViewerThatFallsBehindCatchesUpOnTheCurrentState() throws Exception {
        // Surviving is not enough: the viewer must converge. The ticks it missed collapse into one,
        // and the next it takes carries the directory as it is now — each snapshot is the whole
        // state, so the newest subsumes the ones it replaced. (This is why the strategy is
        // dropPreviousItems and not drop: drop keeps the stream alive but throws away the *new*
        // tick, leaving the viewer on a stale list — measured, not assumed.)
        AssertSubscriber<PublicSessionsSnapshot> viewer = watchingViewer();
        int seen = viewer.getItems().size();

        createSessionAsMaster("Host"); // changes fire while the viewer asks for nothing

        viewer.request(1);
        viewer.awaitItems(seen + 1);
        List<PublicSessionsSnapshot> items = viewer.getItems();
        assertEquals(1, items.get(items.size() - 1).sessions().size(),
                "Catching up must deliver the directory as it is now, not a stale or missed tick");
        viewer.cancel();
    }

    /**
     * A subscriber in the state the production failure needs: subscribed to the change feed and
     * currently between requests.
     * <p>
     * Both halves matter. The stream only subscribes to the change feed once demand arrives, so a
     * viewer that never takes an event never reaches the failing path at all — it just misses ticks.
     * And the failure needs demand to have run out. So: take the initial snapshot, take one change,
     * and stop asking. That is exactly what an SSE client does between events.
     */
    private AssertSubscriber<PublicSessionsSnapshot> watchingViewer() throws Exception {
        AssertSubscriber<PublicSessionsSnapshot> viewer = sessionManager.streamPublicSessions()
                .subscribe().withSubscriber(AssertSubscriber.create(1));
        viewer.awaitItems(1);
        viewer.request(1);
        sessionManager.publishDirectoryChange();
        viewer.awaitItems(2);
        return viewer; // subscribed, and now asking for nothing
    }

    @Test
    void directory_listsPrivateSessionsButWithholdsTheirCode() throws Exception {
        // Sessions are private by default. They are still listed — the browser shows them with a
        // closed padlock and their crew count — but the code is what separates private from public,
        // so publishing it would make "private" mean nothing.
        createSessionAsMaster("Host");

        List<PublicSession> directory = sessionManager.getPublicSessions();
        assertEquals(1, directory.size(), "A private session must still be listed");
        assertTrue(directory.get(0).isPrivate());
        assertEquals("", directory.get(0).sessionId(),
                "A private session's code must never be published: it is the only thing making it private");
        assertEquals(1, directory.get(0).playerAmount(), "The crew count is public either way");
    }

    @Test
    void directory_publishesTheCodeOnceTheSessionGoesPublic() throws Exception {
        String sessionId = createSessionAsMaster("Host", "fr");

        // The region is the session OWNER's country (#672), not the detected server's: a server is
        // detected here (geolocated "xx"), yet the published region must be the master's "fr".
        joinServer("1.1.1.1", 30101);
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, false);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        List<PublicSession> directory = sessionManager.getPublicSessions();
        assertEquals(1, directory.size());
        PublicSession listed = directory.get(0);
        assertFalse(listed.isPrivate());
        assertEquals(1, listed.playerAmount());
        assertTrue(listed.admin().contains("Host"), "The master must be listed as an admin");
        assertEquals("fr", listed.region(), "Region must be the session owner's country (#672), not the detected server's");
        assertEquals(sessionId, listed.sessionId(), "A public session's code is joinable from the browser");

        // The connected-player count rides the same snapshot, so the SSE moves it live instead of
        // it only updating when the user hits Refresh.
        assertEquals(1, sessionManager.getPublicSessionsSnapshot().connectedPlayers(),
                "The snapshot must carry the global connected-player count");
        assertEquals(1, sessionManager.getPublicSessionsSnapshot().sessions().size(),
                "The snapshot must carry the sessions");
    }

    @Test
    void directory_takesTheCodeBackWhenTheSessionGoesPrivateAgain() throws Exception {
        String sessionId = createSessionAsMaster("Host");
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, false);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));
        assertEquals(sessionId, sessionManager.getPublicSessions().get(0).sessionId());

        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, true);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        PublicSession listed = sessionManager.getPublicSessions().get(0);
        assertTrue(listed.isPrivate(), "The row stays listed, now marked private");
        assertEquals("", listed.sessionId(), "Going private must take the code back out of the directory");
    }

    @Test
    void masterCanRenameSession_broadcastAndReflectedInDirectory() throws Exception {
        createSessionAsMaster("Host");
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.SET_VISIBILITY, false);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.RENAME_SESSION, "Rum Runners");
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        assertEquals("Rum Runners", betterFleetClient.getMessageReceived(Fleet.class).getCustomName(),
                "The broadcast fleet must carry the new custom name");
        assertEquals("Rum Runners", sessionManager.getPublicSessions().get(0).name(),
                "The custom name must show in the public directory");
    }

    @Test
    void nonMasterCannotRenameSession() throws Exception {
        String sessionId = createSessionAsMaster("Master");
        BetterFleetClient memberClient = connectMember("Member", sessionId);

        Player member = new Player();
        member.setUsername("Member");
        member.setClientVersion(appVersion.get(0));
        member.setSessionId(sessionId);

        // Rename attempt, then a benign UPDATE. One socket, ordered: once UPDATE round-trips the
        // (ignored) rename has already been handled.
        memberClient.setLatch(new CountDownLatch(1));
        memberClient.sendMessage(MessageType.RENAME_SESSION, "Hacked");
        memberClient.sendMessage(MessageType.UPDATE, member);
        assertTrue(memberClient.getLatch().await(1, TimeUnit.SECONDS));

        assertNull(sessionManager.getSessions().get(sessionId).getCustomName(),
                "A non-master must not be able to rename the session");
    }

    @Test
    void renameWithBlockedWord_isRejected() throws Exception {
        String sessionId = createSessionAsMaster("Host");

        Player host = new Player();
        host.setUsername("Host");
        host.setClientVersion(appVersion.get(0));
        host.setSessionId(sessionId);

        // The rejected rename sends no broadcast; an ordered UPDATE lets us wait deterministically.
        betterFleetClient.setLatch(new CountDownLatch(1));
        betterFleetClient.sendMessage(MessageType.RENAME_SESSION, "Shit Crew");
        betterFleetClient.sendMessage(MessageType.UPDATE, host);
        assertTrue(betterFleetClient.getLatch().await(1, TimeUnit.SECONDS));

        assertNull(sessionManager.getSessions().get(sessionId).getCustomName(),
                "A name tripping the content filter must be rejected");
    }

    @Test
    void slowGeolocation_doesNotHoldTheSessionLock() throws Exception {
        // Regression for the production kick storm: the geolocation HTTP call used to run inside
        // playerJoinSotServer's WRITE lock. At the end of a countdown every player joins their
        // server at once, so every other socket operation blew the 200ms lock timeout ->
        // LockException -> onError -> session.close() (players kicked), and the dropped
        // JOIN_SERVER left the server hidden until a reconnect (by then a cache hit).
        //
        // The blocking call now lives in lookupGeo, which is what this drives: the class-level
        // @Lock makes every method WRITE by default, so dropping its @Lock(Lock.Type.NONE) would
        // bring the whole thing straight back.
        Mockito.when(proxyCheckAPI.resolveGeo(any())).thenAnswer(invocation -> {
            Thread.sleep(400); // far longer than the 200ms lock timeout
            return new ProxyCheckAPI.Geo("Slow Land", "xx");
        });

        String sessionId = createSessionAsMaster("Master");

        Thread resolving = new Thread(() -> sessionManager.lookupGeo(new SotServer("9.9.9.9", 30101)));
        resolving.start();
        awaitCondition(() -> false, 80); // let it get into the slow geolocation

        // A locked read must go straight through instead of timing out on the lock.
        long start = System.currentTimeMillis();
        assertDoesNotThrow(() -> sessionManager.isSessionExist(sessionId),
                "A slow geolocation must not hold the session lock");
        long waited = System.currentTimeMillis() - start;
        assertTrue(waited < 200,
                "Locked reads must not wait on the geolocation (waited " + waited + "ms)");

        resolving.join();
    }

    private String createSessionAsMaster(String username) throws Exception {
        return createSessionAsMaster(username, null);
    }

    private String createSessionAsMaster(String username, String country) throws Exception {
        Player master = new Player();
        master.setUsername(username);
        master.setClientVersion(appVersion.get(0));
        master.setCountry(country);
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

    // A JOIN_SERVER / LEAVE_SERVER payload as the client sends it (the detected server ip:port).
    private Map<String, Object> serverPayload(String ip, int port) {
        return Map.of("ip", ip, "port", port);
    }

    // Reports a detected server and returns the broadcast fleet. Allows extra time because the
    // server-side SotServer creation performs an IP geolocation lookup on first sight.
    private Fleet joinServer(String ip, int port) throws Exception {
        String hash = new SotServer(ip, port).generateHash();
        betterFleetClient.sendMessage(MessageType.JOIN_SERVER, serverPayload(ip, port));
        return awaitBroadcast(fleet -> fleet.getServers().containsKey(hash),
                "a broadcast showing " + ip + ":" + port + " joined");
    }

    /**
     * Waits for a broadcast whose fleet matches. The client keeps only the last message, and the
     * geolocation now lands on its own schedule and broadcasts again, so "the next message" is not
     * necessarily the one this action caused — wait for the state, don't count messages.
     */
    private Fleet awaitBroadcast(Predicate<Fleet> matches, String expectation) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (System.currentTimeMillis() < deadline) {
            Fleet fleet = lastBroadcastFleet();
            if (fleet != null && matches.test(fleet)) {
                return fleet;
            }
            Thread.sleep(20);
        }
        fail("Timed out waiting for " + expectation);
        return null;
    }

    private Fleet lastBroadcastFleet() {
        try {
            return betterFleetClient.getMessageReceived(Fleet.class);
        } catch (Exception e) {
            return null; // the last message wasn't a fleet (e.g. RUN_COUNTDOWN)
        }
    }

    private void leaveServer(String ip, int port) throws Exception {
        String hash = new SotServer(ip, port).generateHash();
        betterFleetClient.sendMessage(MessageType.LEAVE_SERVER, serverPayload(ip, port));
        awaitBroadcast(fleet -> !fleet.getServers().containsKey(hash),
                "a broadcast showing " + ip + ":" + port + " left");
    }

    // True when the fleet has exactly one server and it holds the given player.
    private boolean onlyServerHolds(Fleet fleet, String username) {
        if (fleet.getServers().size() != 1) {
            return false;
        }
        SotServer server = fleet.getServers().values().iterator().next();
        return server.getConnectedPlayers().stream().anyMatch(p -> p.getUsername().equals(username));
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



