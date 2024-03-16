package fr.zelytra;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.is;

@QuarkusTest
public class PublicEndPointsTest {

    @Test
    public void testHelloEndpoint() {
        given()
                .when().get("/")
                .then()
                .statusCode(200)
                .body(is("Pong!"));
    }
}
