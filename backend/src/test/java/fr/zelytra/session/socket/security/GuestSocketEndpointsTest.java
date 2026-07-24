package fr.zelytra.session.socket.security;

import fr.zelytra.session.SessionManager;
import io.quarkus.test.InjectMock;
import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import jakarta.inject.Inject;
import org.junit.jupiter.api.Test;

import java.util.concurrent.ExecutorService;

import static org.hamcrest.Matchers.emptyString;
import static org.hamcrest.Matchers.not;

@QuarkusTest
public class GuestSocketEndpointsTest {

    @Inject
    SessionManager sessionManager;

    // Mocked so createSession()'s background incrementSession() never runs: a live executor would
    // write today's statistics row and collide with StatisticsEntityTest, which persists the same
    // date-keyed row (same pattern as SessionSocketTest).
    @InjectMock
    ExecutorService executorService;

    @Test
    void unknownSessionIsRefused() {
        RestAssured.given()
                .when()
                .get("/guest/register?sessionId=ZZZZZZZ")
                .then()
                .statusCode(404);
    }

    @Test
    void missingSessionIdIsRefused() {
        RestAssured.given()
                .when()
                .get("/guest/register")
                .then()
                .statusCode(404);
    }

    @Test
    void guestPathNeedsNoAuth() {
        // The whole point of the guest path: unlike /socket/register (401 without a valid Keycloak
        // bearer), it is public — the session code is the credential. An unknown code is a 404, never
        // a 401.
        RestAssured.given()
                .when()
                .get("/guest/register?sessionId=NOPE")
                .then()
                .statusCode(404);
    }

    @Test
    void existingSessionMintsAToken() {
        String code = sessionManager.createSession();
        RestAssured.given()
                .when()
                .get("/guest/register?sessionId=" + code)
                .then()
                .statusCode(200)
                .body(not(emptyString()));
    }
}
