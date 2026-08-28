package fr.zelytra.statistics;

import io.quarkus.narayana.jta.QuarkusTransaction;
import io.quarkus.test.junit.QuarkusTest;
import fr.zelytra.session.SessionManager;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * The daily statistics row is written from three different threads - the request thread for
 * {@code /stats/download}, and the two executors behind session and try increments - so both of its
 * operations are genuinely concurrent (#868):
 * <p>
 * 1. <b>Creating the row.</b> The find-then-persist in {@code getEntity} let two threads both see
 * "no row for today" and both persist one, on a date primary key. One of them loses its whole
 * transaction to a constraint violation - and with it, an increment.
 * <p>
 * 2. <b>Incrementing it.</b> {@code entity.setX(entity.getX() + 1)} is a read-modify-write: two
 * transactions reading the same value both write value+1, and one increment silently vanishes.
 * <p>
 * These run real concurrent transactions rather than mocking the race, so they fail on the shipped
 * code and keep failing if the fix is ever undone.
 */
@QuarkusTest
public class StatisticsConcurrencyTest {

    private static final int THREADS = 8;

    @Inject
    StatisticsRepository statisticsRepository;

    @Inject
    SessionManager sessionManager;

    @BeforeEach
    @Transactional
    void setUp() {
        StatisticsEntity.deleteAll();
    }

    /** Runs `task` on THREADS threads released at the same instant, and returns how many threw. */
    private int raceOf(Runnable task) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(THREADS);
        CountDownLatch start = new CountDownLatch(1);
        AtomicInteger failures = new AtomicInteger();
        List<Callable<Void>> racers = new ArrayList<>();
        for (int i = 0; i < THREADS; i++) {
            racers.add(() -> {
                start.await();
                try {
                    task.run();
                } catch (RuntimeException e) {
                    failures.incrementAndGet();
                }
                return null;
            });
        }
        List<Future<Void>> running = new ArrayList<>();
        for (Callable<Void> racer : racers) {
            running.add(pool.submit(racer));
        }
        start.countDown();
        for (Future<Void> future : running) {
            future.get(60, TimeUnit.SECONDS);
        }
        pool.shutdownNow();
        return failures.get();
    }

    @Test
    void concurrentFirstAccessOfTheDayCreatesExactlyOneRow() throws Exception {
        // The first writes after midnight: every thread finds no row and tries to make one.
        int failures = raceOf(() -> QuarkusTransaction.requiringNew()
                .run(() -> statisticsRepository.getEntity()));

        assertEquals(0, failures, "creating the day's row must not lose a transaction to a race");
        long rows = QuarkusTransaction.requiringNew()
                .call(() -> StatisticsEntity.count("date", LocalDate.now()));
        assertEquals(1, rows, "the day must end up with exactly one statistics row");
    }

    @Test
    void concurrentIncrementsAreAllCounted() throws Exception {
        QuarkusTransaction.requiringNew().run(() -> statisticsRepository.getEntity());

        // The production path: SessionManager.incrementTry, called from its own executor.
        int failures = raceOf(() -> sessionManager.incrementTry());

        assertEquals(0, failures, "an increment must not lose its transaction");
        StatisticsEntity entity = QuarkusTransaction.requiringNew()
                .call(() -> StatisticsEntity.<StatisticsEntity>findById(LocalDate.now()));
        assertNotNull(entity);
        assertEquals(
                THREADS,
                entity.getSessionTry(),
                "read-modify-write lost increments: concurrent counters must all land");
    }

    @Test
    void concurrentSessionAndDownloadCountersDoNotOverwriteEachOther() throws Exception {
        QuarkusTransaction.requiringNew().run(() -> statisticsRepository.getEntity());

        // Different columns of the same row, incremented at the same time. A whole-entity
        // read-modify-write makes each side clobber the other's column - and it does so even when
        // only ONE side still uses that pattern: while this test still mirrored the old
        // StatsEndpoints code for downloads, its flush wrote every column back with a stale
        // sessionsOpen and ate half the atomic increments (20 -> 10). Both sides must go through
        // the counter methods.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<?> sessions = pool.submit(() -> {
            for (int i = 0; i < 20; i++) {
                sessionManager.incrementSession();
            }
        });
        Future<?> downloads = pool.submit(() -> {
            for (int i = 0; i < 20; i++) {
                // Exactly what StatsEndpoints.addDownloadCount does.
                statisticsRepository.incrementDownload();
            }
        });
        sessions.get(60, TimeUnit.SECONDS);
        downloads.get(60, TimeUnit.SECONDS);
        pool.shutdownNow();

        StatisticsEntity entity = QuarkusTransaction.requiringNew()
                .call(() -> StatisticsEntity.<StatisticsEntity>findById(LocalDate.now()));
        assertNotNull(entity);
        assertEquals(20, entity.getSessionsOpen(), "session counter lost writes");
        assertEquals(20, entity.getDownload(), "download counter lost writes");
    }
}
