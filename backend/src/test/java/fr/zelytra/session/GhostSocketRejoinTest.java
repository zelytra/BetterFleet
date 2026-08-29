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
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.mockito.Mockito.when;

/**
 * The half-open-socket lockout of #872, reproduced from the production logs: a player's websocket
 * dies without a TCP close (Wi-Fi flap, VPN reconnect, laptop resume), the server-side socket
 * still answers {@code isOpen() == true} - it reports the LOCAL endpoint, not the peer - and the
 * duplicate-join guard then refuses every reconnect from the player's replacement socket. Observed
 * twice in production on 2026-08-29; both lockouts ended only when another member manually kicked
 * the ghost. The 30s idle timeout never fires because session broadcasts count as activity and
 * keep the corpse warm.
 * <p>
 * The guard therefore cannot trust {@code isOpen()} alone: a member that has SENT nothing for
 * longer than {@link SessionManager#GHOST_AFTER_MILLIS} (the client keep-alives every 30s) is a
 * ghost and must be replaced by its own rejoin - while a recently-seen duplicate keeps being
 * refused, which is the #436 protection these tests also pin.
 */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
public class GhostSocketRejoinTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @InjectMock
    ExecutorService executorService;

    private SessionManager sessionManager;
    private final AtomicLong now = new AtomicLong(1_000_000L);

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        sessionManager = new SessionManager();
        sessionManager.proxyCheckAPI = Mockito.mock(ProxyCheckAPI.class);
        when(sessionManager.proxyCheckAPI.resolveGeo(Mockito.any()))
                .thenReturn(new ProxyCheckAPI.Geo("", ""));
        // The liveness clock is driven by the test, never by sleeping.
        sessionManager.clock = now::get;
    }

    private Session openSocket(String id) {
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn(id);
        when(socket.isOpen()).thenReturn(true);
        return socket;
    }

    private Player playerNamed(String username, Session socket) {
        Player player = new Player();
        player.setUsername(username);
        player.setSocket(socket);
        return player;
    }

    @Test
    public void aSilentGhostIsReplacedByTheOwnersOwnRejoin() {
        String sessionId = sessionManager.createSession();
        Session ghostSocket = openSocket("sock-ghost");
        sessionManager.joinSession(sessionId, playerNamed("shiiro", ghostSocket));

        // The connection half-opens: the socket stays isOpen() == true but the peer is gone, so
        // nothing arrives from it. Two and a half keep-alive windows pass.
        now.addAndGet(SessionManager.GHOST_AFTER_MILLIS + 1);

        Session replacement = openSocket("sock-replacement");
        Fleet fleet = sessionManager.joinSession(sessionId, playerNamed("shiiro", replacement));

        assertNotNull(fleet, "a player must be able to rejoin over their own silent ghost");
        assertEquals(1, fleet.getPlayers().size(), "the ghost must be replaced, not duplicated");
        assertSame(replacement, fleet.getPlayers().get(0).getSocket(),
                "the replacement socket must be the live one");
    }

    @Test
    public void aRecentlySeenDuplicateIsStillRefused() {
        // The #436 protection stays intact: a SECOND device of a connected account - whose first
        // device is alive and talking - keeps being refused instead of tearing anything down.
        String sessionId = sessionManager.createSession();
        Session first = openSocket("sock-first");
        sessionManager.joinSession(sessionId, playerNamed("Zelytra", first));

        now.addAndGet(1_000); // well within the liveness window

        Fleet refused = sessionManager.joinSession(sessionId, playerNamed("Zelytra", openSocket("sock-second")));

        assertNull(refused, "a recently-seen duplicate must still be refused");
        Fleet fleet = sessionManager.getFleetFromId(sessionId);
        assertEquals(1, fleet.getPlayers().size());
        assertSame(first, fleet.getPlayers().get(0).getSocket(),
                "the original, live socket must keep its seat");
    }

    @Test
    public void joiningStampsTheLivenessClock() {
        // The join itself is the first sign of life; without this stamp every fresh member would
        // start out looking like a ghost.
        String sessionId = sessionManager.createSession();
        Player player = playerNamed("tazz", openSocket("sock-1"));
        sessionManager.joinSession(sessionId, player);

        assertEquals(now.get(), player.lastSeenMillis(),
                "joining must count as being seen");
    }
}
