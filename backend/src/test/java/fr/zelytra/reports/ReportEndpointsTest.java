package fr.zelytra.reports;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.ws.rs.core.MediaType;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.lessThanOrEqualTo;

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
    public void listAll_isGone() {
        // /list/all was the entire table - every report with its full log capture - to any
        // anonymous caller, with no cap, while the paginated endpoint right next to it refuses
        // amount=500 with a 400 (#831). Nothing has called it since the reports page paginated
        // (#825). "all" does not parse as a page index, so the route must answer 404, not a dump.
        given()
                .when().get("/report/list/all")
                .then()
                .statusCode(404);
    }

    @Test
    public void listReportsPaged_isOpenAndReturnsJson() {
        // 0/5 is the natural "first page" and the input the argument swap used to turn into a 500
        // (page size 0). Asymmetric on purpose: 1/1 passes either way, which is why the swap
        // survived (#823).
        given()
                .when().get("/report/list/0/5")
                .then()
                .statusCode(200)
                .contentType(MediaType.APPLICATION_JSON)
                .body("page", equalTo(0))
                .body("amount", equalTo(5))
                .body("items.size()", lessThanOrEqualTo(5))
                .body("total", greaterThanOrEqualTo(0));
    }

    @Test
    public void listReportsPaged_readsPageAndAmountInThatOrder() {
        // The swap's other half: it silently served the wrong slice. Asking for one report per page
        // must answer with at most one, whatever the page index.
        given()
                .when().get("/report/list/2/1")
                .then()
                .statusCode(200)
                .body("page", equalTo(2))
                .body("amount", equalTo(1))
                .body("items.size()", lessThanOrEqualTo(1));
    }

    @Test
    public void listReportsPaged_slicesAndOrdersNewestFirst() {
        // The half of #823 a shape-only assertion cannot catch: the swap "silently served the wrong
        // slice". Seeding three reports pins the actual contract - newest first, and the second page
        // continuing where the first stopped - so an off-by-one offset or an ascending sort fails
        // here instead of shipping.
        int first = sendReport("oldest");
        int second = sendReport("middle");
        int third = sendReport("newest");

        given()
                .when().get("/report/list/0/2")
                .then()
                .statusCode(200)
                .body("items.size()", equalTo(2))
                .body("items[0].id", equalTo(third))
                .body("items[1].id", equalTo(second))
                .body("total", greaterThanOrEqualTo(3));

        given()
                .when().get("/report/list/1/2")
                .then()
                .statusCode(200)
                .body("items[0].id", equalTo(first));
    }

    @Test
    public void reportPosition_countsFromTheNewest() {
        int older = sendReport("older");
        int newer = sendReport("newer");

        given().when().get("/report/" + newer + "/position")
                .then().statusCode(200).body("position", equalTo(0));
        given().when().get("/report/" + older + "/position")
                .then().statusCode(200).body("position", equalTo(1));
    }

    @Test
    public void listReportsPaged_rejectsUnusableArguments() {
        // A caller's bad input is a 400, not the IllegalArgumentException-turned-500 Panache raised.
        given().when().get("/report/list/0/0").then().statusCode(400);
        given().when().get("/report/list/-1/5").then().statusCode(400);
        // Above the cap: a page is measured in megabytes, so the whole table is not on offer.
        given().when().get("/report/list/0/500").then().statusCode(400);
        // The offset overflows int above MAX_VALUE/amount and Hibernate rejects the negative first
        // result: a 400, not the 500 it used to be.
        given().when().get("/report/list/43000000/50").then().statusCode(400);
    }

    /** Files a report the way the app does and returns its id, so a test can seed an ordering. */
    private int sendReport(String message) {
        given()
                .auth().oauth2(OidcWiremockTestResource.getAccessToken("alice", Set.of("user")))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\":\"" + message + "\",\"logs\":\"l\",\"device\":\"pc\"}")
                .when().post("/report/send")
                .then().statusCode(200);
        // The newest report is the first of the newest-first listing, by definition of the ordering
        // this endpoint guarantees.
        return given().when().get("/report/list/0/1")
                .then().statusCode(200)
                .extract().path("items[0].id");
    }

    @Test
    public void reportPosition_isNotFoundForAnUnknownReport() {
        given()
                .when().get("/report/2147483647/position")
                .then()
                .statusCode(404);
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
