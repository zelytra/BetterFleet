package fr.zelytra.session;

import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.fleet.PublicSessionsSnapshot;
import fr.zelytra.session.player.Player;
import fr.zelytra.statistics.StatisticsRepository;
import io.quarkus.test.InjectMock;
import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.inject.Inject;
import jakarta.websocket.Session;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

/**
 * The 500 on {@code GET /public-sessions} of #908, reproduced: the directory read used to be
 * {@code @Lock(READ, time = 200)}, so any write holding the bean-wide lock past 200 ms made it throw
 * {@code LockException}. Production hit it on the first session created after the v2.4.10 deploy,
 * when the cold publish path kept {@code createSession} inside its critical section long enough.
 * <p>
 * Unlike the other session tests this one goes through the CDI bean, since the lock interceptor is
 * exactly what is under test. The write is held open deterministically by a creator whose banner
 * getter (read by {@code createSession} under the WRITE lock) blocks until the test releases it.
 */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
public class DirectoryReadUnderWriteLockTest {

    @InjectMock
    StatisticsRepository statisticsRepository;

    @Inject
    SessionManager sessionManager;

    /** A creator that parks {@code createSession} inside its write lock until released. */
    private static class SlowCreator extends Player {
        final CountDownLatch insideWriteLock = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        volatile boolean holding = true;

        @Override
        public int getBanner() {
            if (holding) {
                insideWriteLock.countDown();
                try {
                    release.await(5, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            return super.getBanner();
        }
    }

    @Test
    public void theDirectoryStaysReadableWhileASessionIsBeingCreated() throws Exception {
        SlowCreator creator = new SlowCreator();
        creator.setUsername("slow-creator-908");
        Session socket = Mockito.mock();
        when(socket.getId()).thenReturn("sock-slow-creator-908");
        when(socket.isOpen()).thenReturn(true);
        creator.setSocket(socket);

        CompletableFuture<Fleet> creation = CompletableFuture.supplyAsync(() -> sessionManager.createSession(creator));
        try {
            assertTrue(creator.insideWriteLock.await(5, TimeUnit.SECONDS),
                    "createSession must have reached its critical section");

            // Well past the old 200 ms budget: the write lock is still held while we read.
            Thread.sleep(300);
            PublicSessionsSnapshot snapshot = assertDoesNotThrow(() -> sessionManager.getPublicSessionsSnapshot(),
                    "a read-only directory listing must not fail because a session is being created");
            assertNotNull(snapshot);
            assertDoesNotThrow(() -> sessionManager.getPublicSessions());
        } finally {
            creator.holding = false;
            creator.release.countDown();
        }

        Fleet fleet = creation.get(5, TimeUnit.SECONDS);
        assertNotNull(fleet);
        // The bean is application-scoped and shared with other tests: leave nothing behind.
        sessionManager.leaveSession(creator);
    }
}
