package fr.zelytra.session;


import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.statistics.StatisticsEntity;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.websocket.Session;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.mockito.MockitoAnnotations;

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

        sessionManager.playerJoinSotServer(player, server);

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

        sessionManager.playerJoinSotServer(player, server);

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

        sessionManager.playerJoinSotServer(player, server);
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

        sessionManager.playerJoinSotServer(player, server);
        assertTrue(sessionManager.getSessions().get(sessionId1).getServers().get(serverHash).getConnectedPlayers().contains(player), "The player should be connected to SoT server");

        sessionManager.playerLeaveSotServer(player, server);
        assertNull(sessionManager.getSessions().get(sessionId1).getServers().get(serverHash), "The SoT server is still up");
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
}
