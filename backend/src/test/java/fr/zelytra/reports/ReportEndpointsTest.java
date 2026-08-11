package fr.zelytra.reports;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.ws.rs.core.MediaType;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static io.restassured.RestAssured.given;

/**
 * Endpoint coverage for the bug-report resource, which previously had none. Verifies the open
 * listing endpoints answer, that submitting a report requires authentication, and that an
 * authenticated submission saves fine with the Discord webhook unset (its default everywhere but
 * production): the notification is optional and must never touch the report path.
 */
@QuarkusTest
@QuarkusTestResource(OidcWiremockTestResource.class)
public class ReportEndpointsTest {

    @Test
    public void listAllReports_isOpenAndReturnsJson() {
        given()
                .when().get("/report/list/all")
                .then()
                .statusCode(200)
                .contentType(MediaType.APPLICATION_JSON);
    }

    @Test
    public void listReportsPaged_isOpenAndReturnsJson() {
        // Path is /list/{page}/{amount}, but the resource calls page(amount, page) => the FIRST
        // segment is used as the Panache page size, which must be > 0.
        given()
                .when().get("/report/list/1/1")
                .then()
                .statusCode(200)
                .contentType(MediaType.APPLICATION_JSON);
    }

    @Test
    public void sendReport_withoutAuthentication_isRejected() {
        given()
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\":\"a bug\",\"logs\":\"stacktrace\",\"device\":\"pc\"}")
                .when().post("/report/send")
                .then()
                .statusCode(401);
    }

    @Test
    public void sendReport_authenticated_savesWithTheWebhookUnset() {
        // discord.report.webhook-url is blank in tests (no secret needed), so this also proves the
        // notifier's "unset = silently off" contract on the real path.
        given()
                .auth().oauth2(OidcWiremockTestResource.getAccessToken("alice", Set.of("user")))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\":\"a bug\",\"logs\":\"stacktrace\",\"device\":\"pc\"}")
                .when().post("/report/send")
                .then()
                .statusCode(200);
    }
}
