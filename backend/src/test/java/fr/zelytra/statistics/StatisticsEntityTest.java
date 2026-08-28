package fr.zelytra.statistics;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class StatisticsEntityTest {

    // This test persists a row keyed on TODAY, so it needs the table empty of today's row - which
    // it used to get by luck of execution order. Any other test leaving one behind (the #868
    // concurrency tests do) turned that luck into a primary-key collision.
    @BeforeEach
    @Transactional
    void setUp() {
        StatisticsEntity.deleteAll();
    }

    @Test
    @Transactional
    public void testStatisticsEntityPersistence() {
        LocalDate testDate = LocalDate.now();
        int testDownload = 100;
        int testSessionsOpen = 50;
        int testSessionTry = 75;

        StatisticsEntity statisticsEntity = new StatisticsEntity();
        statisticsEntity.setDate(testDate);
        statisticsEntity.setDownload(testDownload);
        statisticsEntity.setSessionsOpen(testSessionsOpen);
        statisticsEntity.setSessionTry(testSessionTry);

        StatisticsEntity.persist(statisticsEntity);

        StatisticsEntity foundEntity = StatisticsEntity.findById(statisticsEntity.getDate());

        assertEquals(testDate, foundEntity.getDate());
        assertEquals(testDownload, foundEntity.getDownload());
        assertEquals(testSessionsOpen, foundEntity.getSessionsOpen());
        assertEquals(testSessionTry, foundEntity.getSessionTry());
    }
}
