package fr.zelytra.session.socket.security;

import io.quarkus.test.junit.QuarkusTest;
import io.restassured.RestAssured;
import org.junit.jupiter.api.Test;

@QuarkusTest
public class SocketSecurityEndpointsTest {

    private static final String RANDOM_BEARER_TOKEN = "337aab0f-b547-489b-9dbd-a54dc7bdf20d";

    @Test
    void testPermitAll() {
        RestAssured.given()
                .when()
                .header("Authorization", "Bearer: " + RANDOM_BEARER_TOKEN)
                .get("/socket/register")
                .then()
                .statusCode(401);
    }
}
