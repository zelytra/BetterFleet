package fr.zelytra.reports;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.ws.rs.core.MediaType;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;

/**
 * Endpoint coverage for the bug-report resource, which previously had none. Verifies the open
 * listing endpoints answer and that submitting a report requires authentication.
 */
@QuarkusTest
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
}
