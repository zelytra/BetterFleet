package fr.zelytra.statistics;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.transaction.Transactional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.hasSize;

/**
 * /stats/tries and /stats/regions against the real (H2) repository - same split as
 * {@link StatsHistoryEndpointTest}: {@link StatsEndpointsTest}'s class-wide mock would hijack the
 * repository here, and {@link AllianceStatsEndpointsTest} stays a plain unit test of the scoring.
 * The website consumes both payloads as-is, so these lock the wire contract: the tries histogram is
 * one bucket per try number sorted ascending, converged counted by today's rule (largestGroup, not
 * the stored flag), and the regions list answers for either dimension, busiest first.
 */
@QuarkusTest
public class AllianceAggregatesEndpointTest {

    @BeforeEach
    @Transactional
    void setUp() {
        // Clean up the database to ensure a consistent starting state for each test
        AllianceAttempt.deleteAll();
    }

    @Transactional
    void persistAttempt(int tryNumber, int largestGroup, String ownerRegion, String serverRegion) {
        AllianceAttempt attempt = new AllianceAttempt();
        attempt.tsUtc = Instant.parse("2026-08-01T20:00:00Z");
        attempt.ownerRegion = ownerRegion;
        attempt.serverRegion = serverRegion;
        attempt.players = 4;
        attempt.largestGroup = largestGroup;
        attempt.distinctServers = Math.max(1, attempt.players - largestGroup + 1);
        attempt.converged = largestGroup >= 2;
        attempt.tryNumber = tryNumber;
        attempt.persist();
    }

    @Test
    void triesHistogramIsEmptyWhenNoAttemptsExist() {
        given()
                .when().get("/stats/tries")
                .then()
                .statusCode(200)
                .body("$", hasSize(0));
    }

    @Test
    void triesHistogramGroupsByTryNumberSortedAscending() {
        // Persisted out of order on purpose: the endpoint owns the try-number ordering.
        persistAttempt(3, 4, "fr", "de");
        persistAttempt(1, 1, "fr", "de"); // first try, nobody grouped
        persistAttempt(1, 3, "de", "de");
        persistAttempt(1, 2, "us", "us");

        given()
                .when().get("/stats/tries")
                .then()
                .statusCode(200)
                .body("$", hasSize(2))
                .body("[0].tryNumber", equalTo(1))
                .body("[0].attempts", equalTo(3))
                .body("[0].converged", equalTo(2))
                .body("[1].tryNumber", equalTo(3))
                .body("[1].attempts", equalTo(1))
                .body("[1].converged", equalTo(1));
    }

    @Test
    void triesHistogramCountsConvergenceByTodaysRuleNotTheStoredFlag() {
        // A pre-#700 row: three of four grouped up but the flag of the day said "not converged".
        // The histogram must answer by largestGroup, like the rest of the dashboard.
        persistLegacyAttempt();

        given()
                .when().get("/stats/tries")
                .then()
                .statusCode(200)
                .body("[0].attempts", equalTo(1))
                .body("[0].converged", equalTo(1));
    }

    @Transactional
    void persistLegacyAttempt() {
        AllianceAttempt legacy = new AllianceAttempt();
        legacy.tsUtc = Instant.parse("2026-06-01T20:00:00Z");
        legacy.ownerRegion = "fr";
        legacy.serverRegion = "de";
        legacy.players = 4;
        legacy.largestGroup = 3;
        legacy.distinctServers = 2;
        legacy.converged = false; // what the old rule decided, kept on the row as the audit trail
        legacy.tryNumber = 1;
        legacy.persist();
    }

    @Test
    void regionsDefaultsToOwnerCountsBusiestFirst() {
        persistAttempt(1, 2, "fr", "de");
        persistAttempt(1, 2, "fr", "nl");
        persistAttempt(1, 2, "us", "de");

        given()
                .when().get("/stats/regions")
                .then()
                .statusCode(200)
                .body("$", hasSize(2))
                .body("[0].region", equalTo("fr"))
                .body("[0].attempts", equalTo(2))
                .body("[1].region", equalTo("us"));
    }

    @Test
    void regionsServerDimensionCountsWhereTheBiggestGroupLanded() {
        persistAttempt(1, 2, "fr", "de");
        persistAttempt(1, 2, "fr", "de");
        persistAttempt(1, 2, "us", "nl");
        persistAttempt(1, 2, "gb", ""); // never resolved a server country: skipped, not "unknown"

        given()
                .when().get("/stats/regions?dimension=server")
                .then()
                .statusCode(200)
                .body("$", hasSize(2))
                .body("[0].region", equalTo("de"))
                .body("[0].attempts", equalTo(2))
                .body("[1].region", equalTo("nl"))
                .body("[1].attempts", equalTo(1));
    }
}
