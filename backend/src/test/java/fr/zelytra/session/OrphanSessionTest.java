package fr.zelytra.session;

import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.ip.ProxyCheckAPI;
import fr.zelytra.session.player.Player;
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

import java.util.concurrent.ExecutorService;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * The orphaned empty session of #876. Creating a session and attaching its creator used to be two
 * separately write-locked operations: {@code createSession()} published an EMPTY fleet and returned
 * its id, and the creator arrived through a second {@code joinSession} call. When that second lock
 * could not be taken within its 200 ms budget - routine during the reconnect storm every backend
 * restart triggers - the join threw and the already-published fleet stayed in the directory with
 * nobody inside, since disband only ever runs when the last player LEAVES.
 * <p>
 * Observed in production right after the v2.4.3 deploy (session {@code 99FC23A}, orphaned ~98 s,
 * player report 1051). The cure is atomicity: a session is published only once it carries its
 * creator, so the window in which an empty one can exist is gone rather than swept up afterwards.
 */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
public class OrphanSessionTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @InjectMock
    ExecutorService executorService;

    private SessionManager sessionManager;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        sessionManager = new SessionManager();
        sessionManager.proxyCheckAPI = Mockito.mock(ProxyCheckAPI.class);
        when(sessionManager.proxyCheckAPI.resolveGeo(Mockito.any()))
                .thenReturn(new ProxyCheckAPI.Geo("", ""));
    }

    private Player creator(String username) {
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn("sock-" + username);
        when(socket.isOpen()).thenReturn(true);
        Player player = new Player();
        player.setUsername(username);
        player.setSocket(socket);
        return player;
    }

    @Test
    public void aCreatedSessionAlwaysCarriesItsCreator() {
        Player zelytra = creator("zelytra");

        Fleet fleet = sessionManager.createSession(zelytra);

        assertNotNull(fleet, "creating a session must hand back the fleet, creator included");
        assertEquals(1, fleet.getPlayers().size(),
                "a session must never exist without the player who created it");
        assertSame(zelytra, fleet.getPlayers().get(0));
        assertTrue(zelytra.isMaster(), "the creator is the session's master");
    }

    @Test
    public void noPlayerlessSessionIsEverPublished() {
        // The directory is what other players see: an empty session in it is the visible symptom
        // of #876 - "session dédoublée avec personne dedans".
        sessionManager.createSession(creator("zelytra"));

        boolean anyEmpty = sessionManager.getPublicSessionsSnapshot().sessions().stream()
                .anyMatch(session -> session.playerAmount() == 0);
        assertFalse(anyEmpty, "no session with zero players may reach the public directory");
    }

    @Test
    public void theCreatorIsRegisteredAsAMemberAndCanBeFoundBack() {
        // The creator must be a full member, not just a list entry: everything downstream - the
        // ghost check (#872), disband on leave, the socket lookup - keys on these.
        Player zelytra = creator("zelytra");
        Fleet fleet = sessionManager.createSession(zelytra);

        assertSame(fleet, sessionManager.getFleetByPlayerName("zelytra"),
                "the creator must be findable by name");
        assertNotNull(sessionManager.getPlayerFromSessionId("sock-zelytra"),
                "the creator must be findable by their socket");
        assertTrue(zelytra.lastSeenMillis() > 0, "creating counts as being seen (#872)");
    }

    @Test
    public void openingASecondSessionLeavesTheFirstOneBehind() {
        // Creating is also a departure from wherever the creator was: the two-step path got this
        // from joinSession, and losing it would strand the previous fleet - the very leak of #876
        // arriving through the other door.
        Player zelytra = creator("zelytra");
        String first = sessionManager.createSession(zelytra).getSessionId();

        Fleet second = sessionManager.createSession(zelytra);

        assertFalse(sessionManager.isSessionExist(first),
                "the session the creator left must not linger behind them");
        assertEquals(1, sessionManager.getSessions().size(),
                "opening a session must never leave two behind");
        assertSame(zelytra, second.getPlayers().get(0));
    }

    @Test
    public void theCreatorLeavingDisbandsTheSessionAsBefore() {
        // Atomic creation must not change the end of life: the last player out still takes the
        // session with them, which is what keeps the directory clean.
        Player zelytra = creator("zelytra");
        Fleet fleet = sessionManager.createSession(zelytra);
        String sessionId = fleet.getSessionId();

        sessionManager.leaveSession(zelytra);

        assertFalse(sessionManager.isSessionExist(sessionId),
                "the last player leaving must still disband the session");
    }
}
