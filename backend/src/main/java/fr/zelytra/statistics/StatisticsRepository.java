package fr.zelytra.statistics;

import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;

import java.time.LocalDate;

/**
 * The daily statistics row, written from three threads at once (#868): the request thread for
 * {@code /stats/download} and the two executors behind the session and try counters.
 * <p>
 * Both of its operations used to be racy, and a test drove both to failure before this was written:
 * find-then-persist lost 5 transactions out of 8 racing to create the day's first row, and
 * whole-entity read-modify-write increments lost 5 of 20 concurrent writes. Now the database does
 * the arithmetic - one UPDATE per counter, serialised by the row lock - and creating the row
 * tolerates losing the race instead of taking the caller's transaction down with it.
 */
@ApplicationScoped
public class StatisticsRepository implements PanacheRepository<StatisticsEntity> {

    /**
     * The row for today, creating it if this is the day's first write.
     * <p>
     * A concurrent creator is expected here, not exceptional: two threads both see no row, both
     * insert, and the database refuses the second on the date primary key. The insert therefore
     * runs in its OWN transaction, so a lost race cannot mark the caller's transaction rollback-only
     * - which is exactly how an increment used to disappear along with it.
     */
    public StatisticsEntity getEntity() {
        StatisticsEntity entity = StatisticsEntity.findById(LocalDate.now());
        if (entity == null) {
            createTodayIfAbsent();
            entity = StatisticsEntity.findById(LocalDate.now());
        }
        return entity;
    }

    private void createTodayIfAbsent() {
        try {
            QuarkusTransaction.requiringNew().run(() -> {
                if (StatisticsEntity.findById(LocalDate.now()) == null) {
                    new StatisticsEntity().persist();
                }
            });
        } catch (RuntimeException ignored) {
            // Another thread inserted the same date between the check and the flush. The row
            // exists, which is all the caller needs; the winner's insert is as good as ours.
        }
    }

    /**
     * Adds one to a counter with a single UPDATE, so the database - not the application - reads
     * and writes the value under its row lock. A read-modify-write in Java loses concurrent
     * increments silently; {@code column = column + 1} cannot.
     * <p>
     * The whole thing runs in its own transaction: these counters are fire-and-forget telemetry
     * called from executors, and a statistic must never be able to roll back the session work that
     * happened to trigger it.
     */
    private void increment(String field) {
        QuarkusTransaction.requiringNew().run(() -> {
            getEntity();
            update(field + " = " + field + " + 1 where date = ?1", LocalDate.now());
        });
    }

    public void incrementDownload() {
        increment("download");
    }

    public void incrementSessionsOpen() {
        increment("sessionsOpen");
    }

    public void incrementSessionTry() {
        increment("sessionTry");
    }
}
