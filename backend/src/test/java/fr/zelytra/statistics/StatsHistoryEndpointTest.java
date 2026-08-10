package fr.zelytra.statistics;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

/**
 * /stats/history against the real (H2) repository - deliberately NOT in {@link StatsEndpointsTest},
 * whose class-wide {@code @InjectMock StatisticsRepository} would hijack the repository here. The
 * website's chart consumes this payload as-is, so the test locks the wire contract: one row per
 * day, dates as yyyy-MM-dd, sorted ascending whatever order they were written in.
 */
@QuarkusTest
public class StatsHistoryEndpointTest {

    @BeforeEach
    @Transactional
    void setUp() {
        // Clean up the database to ensure a consistent starting state for each test
        StatisticsEntity.deleteAll();
    }

    @Transactional
    void persistDay(LocalDate date, int download) {
        StatisticsEntity entity = new StatisticsEntity();
        entity.setDate(date);
        entity.setDownload(download);
        entity.persist();
    }

    @Test
    void historyIsEmptyWhenNoStatsExist() {
        given()
                .when().get("/stats/history")
                .then()
                .statusCode(200)
                .body("$", hasSize(0));
    }

    @Test
    void historyReturnsOneRowPerDaySortedByDate() {
        // Persisted out of order on purpose: the endpoint owns the date ordering.
        persistDay(LocalDate.of(2026, 8, 9), 12);
        persistDay(LocalDate.of(2026, 8, 7), 30);
        persistDay(LocalDate.of(2026, 8, 8), 21);

        given()
                .when().get("/stats/history")
                .then()
                .statusCode(200)
                .body("$", hasSize(3))
                .body("[0].date", equalTo("2026-08-07"))
                .body("[0].download", equalTo(30))
                .body("[1].date", equalTo("2026-08-08"))
                .body("[2].date", equalTo("2026-08-09"))
                .body("[2].download", equalTo(12));
    }
}
