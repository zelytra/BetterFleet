package fr.zelytra.session;


import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.PublicSessionsSnapshot;
import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.session.socket.MessageType;
import fr.zelytra.statistics.StatisticsEntity;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.test.InjectMock;
import io.smallrye.mutiny.helpers.test.AssertSubscriber;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.websocket.RemoteEndpoint;
import jakarta.websocket.SendHandler;
import jakarta.websocket.SendResult;
import jakarta.websocket.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
public class SessionManagerTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @InjectMock
    ExecutorService executorService;

    private SessionManager sessionManager;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        Mockito.doReturn(null).when(executorService).submit(any(Runnable.class));
        sessionManager = new SessionManager();
        // Keep server creation offline: no proxycheck.io call, deterministic location.
        sessionManager.proxyCheckAPI = Mockito.mock(ProxyCheckAPI.class);
        when(sessionManager.proxyCheckAPI.resolveGeo(any())).thenReturn(new ProxyCheckAPI.Geo("", ""));
        when(sessionManager.proxyCheckAPI.resolveLocation(any())).thenReturn("");
    }

    @Test
    public void testCreateSession() {
        StatisticsEntity mockStatisticsEntity = new StatisticsEntity();
        when(statisticsRepository.getEntity()).thenReturn(mockStatisticsEntity);

        String sessionId = sessionManager.createSession();

        assertNotNull(sessionId, "The session is null");
        assertNotNull(sessionManager.getSessions().get(sessionId), "The session has not been pushed in the Map");
        assertEquals(1, sessionManager.getSessions().size(), "No session/Multiple sessions has been pushed into the Map instead of 1");
    }

    @Test
    public void isSessionExist_SessionExist_True() {
        String sessionId = sessionManager.createSession();
        assertTrue(sessionManager.isSessionExist(sessionId), "This sessions should exist");
    }

    @Test
    public void isSessionExist_SessionExist_False() {
        assertFalse(sessionManager.isSessionExist("123456"), "This session shouldn't exist");
    }

    @Test
    public void joinSession_PlayerConnectedAnywhereJoinSession_JoinSessionTrue() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");

        String sessionId = sessionManager.createSession();
        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        sessionManager.joinSession(sessionId, player);

        Fleet fleet = sessionManager.getFleetFromId(sessionId);
        assertNotNull(fleet, "Fleet should exist");
        assertTrue(fleet.getPlayers().contains(player), "The player is not in the session he's trying to join");
    }

    @Test
    public void joinSession_PlayerConnectedToTwoSessionWithDifferentSocket_PlayerLeaveFirstSession() {
        Session session1 = Mockito.mock();
        when(session1.getId()).thenReturn("1");

        Session session2 = Mockito.mock();
        when(session2.getId()).thenReturn("2");

        String sessionId1 = sessionManager.createSession();
        String sessionId2 = sessionManager.createSession();

        // Player1 with Socket1
        Player playerSocket1 = new Player();
        playerSocket1.setUsername("Player 1");
        playerSocket1.setSocket(session1);

        // Player1 with Socket2
        Player playerSocket2 = new Player();
        playerSocket2.setUsername("Player 1");
        playerSocket2.setSocket(session2);

        sessionManager.joinSession(sessionId1, playerSocket1);
        sessionManager.joinSession(sessionId2, playerSocket2);

        Fleet fleet1 = sessionManager.getFleetFromId(sessionId1);
        Fleet fleet2 = sessionManager.getFleetFromId(sessionId2);

        assertNull(fleet1, "Fleet1 should be disbanded");
        assertNotNull(fleet2, "Fleet2 should exist");
        assertTrue(fleet2.getPlayers().contains(playerSocket2), "The player should be contain in this session");
    }

    @Test
    public void joinSession_PlayerConnectedAnywhereJoinNonExistantSession_JoinSessionFalse() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        assertNull(sessionManager.joinSession("nothing", player));
    }

    @Test
    public void joinSession_PlayerConnectedInSessionsJoinAnotherSession_JoinSessionNewSessionTrue() {
        List<Player> fakePlayers = new ArrayList<>();

        for (int x = 0; x <= 1; x++) {
            Session session = Mockito.mock();
            when(session.getId()).thenReturn(String.valueOf(x));
            when(session.getAsyncRemote()).thenReturn(null);

            Player player = new Player();
            player.setUsername("Player " + x);
            player.setSocket(session);
            fakePlayers.add(player);
        }

        String sessionId1 = sessionManager.createSession();
        String sessionId2 = sessionManager.createSession();

        sessionManager.joinSession(sessionId1, fakePlayers.get(0));
        sessionManager.joinSession(sessionId2, fakePlayers.get(0));

        assertNull(sessionManager.getSessions().get(sessionId1), "The sessions should be disbanded");
        assertTrue(sessionManager.getSessions().get(sessionId2).getPlayers().contains(fakePlayers.get(0)), "Player should be connected into the new session");
    }

    @Test
    public void leaveSession_PlayerConnectedOnMultipleSessions_LeaveAllSession() {
        List<Player> fakePlayers = new ArrayList<>();

        for (int x = 0; x <= 2; x++) {
            Session session = Mockito.mock();
            when(session.getId()).thenReturn(String.valueOf(x));
            when(session.getAsyncRemote()).thenReturn(null);

            Player player = new Player();
            player.setUsername("Player " + x);
            player.setSocket(session);
            fakePlayers.add(player);
        }

        String sessionId1 = sessionManager.createSession();
        String sessionId2 = sessionManager.createSession();

        sessionManager.joinSession(sessionId1, fakePlayers.get(0));
        sessionManager.joinSession(sessionId1, fakePlayers.get(1));
        sessionManager.joinSession(sessionId2, fakePlayers.get(0));
        sessionManager.joinSession(sessionId2, fakePlayers.get(2));

        sessionManager.leaveSession(fakePlayers.get(0));

        assertFalse(sessionManager.getSessions().get(sessionId1).getPlayers().contains(fakePlayers.get(0)), "The player shouldn't be connected to this session");
        assertFalse(sessionManager.getSessions().get(sessionId2).getPlayers().contains(fakePlayers.get(0)), "The player shouldn't be connected to this session");

    }

    @Test
    public void leaveSession_PlayerConnectedLeaveAllianceWhenMaster_LeaveAllSession() {
        List<Player> fakePlayers = new ArrayList<>();

        for (int x = 0; x <= 1; x++) {
            Session session = Mockito.mock();
            when(session.getId()).thenReturn(String.valueOf(x));
            when(session.getAsyncRemote()).thenReturn(null);

            Player player = new Player();
            player.setUsername("Player " + x);
            player.setMaster(true);
            player.setSocket(session);
            fakePlayers.add(player);
        }

        String sessionId1 = sessionManager.createSession();

        sessionManager.joinSession(sessionId1, fakePlayers.get(0));
        sessionManager.joinSession(sessionId1, fakePlayers.get(1));

        sessionManager.leaveSession(fakePlayers.get(0));
        assertTrue(sessionManager.getSessions().get(sessionId1).getPlayers().get(0).isMaster(), "The player should be master");
    }

    @Test
    public void getSotServerFromPlayer_SotServerShouldBeReturn_True() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        String sessionId1 = sessionManager.createSession();
        sessionManager.joinSession(sessionId1, player);
        SotServer server = new SotServer("1.1.1.1", 8080);

        sessionManager.playerJoinSotServer(player, sessionManager.resolveSotServer(server));

        assertNotNull(sessionManager.getSotServerFromPlayer(player), "The SoT server should be returned+");
    }

    @Test
    public void playerJoinSotServer_PlayerShouldJoinSotServer_True() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        String sessionId1 = sessionManager.createSession();
        sessionManager.joinSession(sessionId1, player);
        SotServer server = new SotServer("1.1.1.1", 8080);
        String serverHash = server.getHash();

        sessionManager.playerJoinSotServer(player, sessionManager.resolveSotServer(server));

        assertTrue(sessionManager.getSessions().get(sessionId1).getServers().get(serverHash).getConnectedPlayers().contains(player), "The player should be connected to SoT server");
    }

    @Test
    public void playerJoinSotServer_CacheSotServerShouldNotContainedConnectedPlayers() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        String sessionId1 = sessionManager.createSession();
        sessionManager.joinSession(sessionId1, player);
        SotServer server = new SotServer("1.1.1.1", 8080);
        String serverHash = server.getHash();

        sessionManager.playerJoinSotServer(player, sessionManager.resolveSotServer(server));
        assertEquals(0, sessionManager.getSotServers().get(serverHash).getConnectedPlayers().size(), "Any player should be inside the cache system of the servers");
    }

    @Test
    public void playerLeaveSotServer_PlayerShouldLeaveSotServer_True() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        String sessionId1 = sessionManager.createSession();
        sessionManager.joinSession(sessionId1, player);
        SotServer server = new SotServer("1.1.1.1", 8080);
        String serverHash = server.getHash();

        sessionManager.playerJoinSotServer(player, sessionManager.resolveSotServer(server));
        assertTrue(sessionManager.getSessions().get(sessionId1).getServers().get(serverHash).getConnectedPlayers().contains(player), "The player should be connected to SoT server");

        sessionManager.playerLeaveSotServer(player, server);
        assertNull(sessionManager.getSessions().get(sessionId1).getServers().get(serverHash), "The SoT server is still up");
    }

    @Test
    public void joinSession_SameAccountJoinsSameSessionTwice_DuplicateRefusedAndSessionIntact() {
        // Regression test for issue #436: a second live connection from the same account joining
        // the session it is already in must be refused, and must NOT tear down the fleet.
        Session socket1 = Mockito.mock();
        when(socket1.getId()).thenReturn("1");
        when(socket1.isOpen()).thenReturn(true); // the original member is still connected

        Session socket2 = Mockito.mock();
        when(socket2.getId()).thenReturn("2");
        when(socket2.getAsyncRemote()).thenReturn(null); // refusal frame is sent here; null -> handled gracefully

        String sessionId = sessionManager.createSession();

        Player first = new Player();
        first.setUsername("Dupe");
        first.setSocket(socket1);
        sessionManager.joinSession(sessionId, first);

        Player duplicate = new Player();
        duplicate.setUsername("Dupe");
        duplicate.setSocket(socket2);
        Fleet result = sessionManager.joinSession(sessionId, duplicate);

        assertNull(result, "A duplicate join into the same session must be refused");

        Fleet fleet = sessionManager.getFleetFromId(sessionId);
        assertNotNull(fleet, "The session must survive a duplicate join (must not be disbanded)");
        assertEquals(1, fleet.getPlayers().size(), "The duplicate must not be added to the fleet");
        assertTrue(fleet.getPlayers().contains(first), "The original member must remain untouched");
    }

    @Test
    public void joinSession_MistypedCodeWhileInASession_KeepsPlayerInTheirCurrentSession() {
        // Issue #733: a player already in a session mistypes a join code, a session id that does
        // not exist. The failed join must be a no-op: they must NOT be silently dropped from the
        // session they were in. The bug evicts them before checking the target exists.
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn("1");
        when(socket.getAsyncRemote()).thenReturn(null); // the SESSION_NOT_FOUND send is a graceful no-op here

        Player player = new Player();
        player.setUsername("Sailor");
        player.setSocket(socket);

        String sessionId = sessionManager.createSession();
        sessionManager.joinSession(sessionId, player);
        assertTrue(sessionManager.isPlayerInSession(player, sessionId), "Precondition: the player is in a session");

        // The same account mistypes a code: the target session does not exist.
        Player mistyped = new Player();
        mistyped.setUsername("Sailor");
        mistyped.setSocket(socket);
        Fleet result = sessionManager.joinSession(sessionId + "-typo", mistyped);

        assertNull(result, "Joining a non-existent session must fail");
        assertNotNull(sessionManager.getFleetFromId(sessionId),
                "A mistyped join code must not disband the session the player was in (#733)");
        assertTrue(sessionManager.isPlayerInSession(player, sessionId),
                "A mistyped join code must not evict the player from their current session (#733)");
    }

    @Test
    public void sendThenClose_ClosesTheSocketOnlyAfterTheFrameIsFlushed() throws Exception {
        // Issue #733: the refusal frame (SESSION_NOT_FOUND / CONNECTION_REFUSED / OUTDATED_CLIENT)
        // is the last thing the server says before hanging up. It is written on the async remote,
        // which returns before the frame is on the wire, so closing on the very next line can beat
        // it, and the client never learns why it was disconnected. The close must wait for the send.
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn("1");
        when(socket.isOpen()).thenReturn(true);
        RemoteEndpoint.Async async = Mockito.mock();
        when(socket.getAsyncRemote()).thenReturn(async);

        ArgumentCaptor<SendHandler> onSent = ArgumentCaptor.forClass(SendHandler.class);

        sessionManager.sendThenClose(socket, MessageType.SESSION_NOT_FOUND, null);

        // The frame has been handed to the async remote, but the socket must NOT be closed yet.
        Mockito.verify(async).sendText(Mockito.anyString(), onSent.capture());
        Mockito.verify(socket, Mockito.never()).close();

        // Once the frame is actually flushed, the socket closes, so the client is always told why.
        onSent.getValue().onResult(new SendResult());
        Mockito.verify(socket).close();
    }

    @Test
    public void isPlayerInSession_PlayerIsInASession_True() {
        Session session = Mockito.mock();
        when(session.getId()).thenReturn("123");
        when(session.getAsyncRemote()).thenReturn(null);

        Player player = new Player();
        player.setUsername("Player 1");
        player.setSocket(session);

        String sessionId1 = sessionManager.createSession();
        sessionManager.joinSession(sessionId1, player);

        assertTrue(sessionManager.isPlayerInSession(player, sessionId1), "The player is not in the session");
    }
    /**
     * The public-sessions stream must keep talking when nothing changes (#839).
     * <p>
     * Its silence was indistinguishable from a dead stream, so the client's 5s poll - meant to idle
     * whenever the stream works - ran at full cadence and became 96% of all API traffic. The
     * heartbeat is what closes that gate, including for every client already shipped.
     */
    @Test
    public void publicSessionsStreamHeartbeatsWhileNothingChanges() {
        AssertSubscriber<PublicSessionsSnapshot> subscriber =
                sessionManager.streamPublicSessions()
                        .subscribe().withSubscriber(AssertSubscriber.create(3));

        // The opening snapshot, then two heartbeats: no session is created or closed here, so
        // anything after the first item can only come from the timer.
        subscriber.awaitItems(3, Duration.ofSeconds(15));
        subscriber.cancel();
    }

}
