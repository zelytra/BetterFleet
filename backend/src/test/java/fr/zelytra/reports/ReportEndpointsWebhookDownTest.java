package fr.zelytra.reports;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.quarkus.test.oidc.server.OidcWiremockTestResource;
import jakarta.ws.rs.core.MediaType;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Set;

import static io.restassured.RestAssured.given;

/**
 * The other half of the notifier's contract: with a webhook CONFIGURED but unreachable, submitting
 * a report still answers exactly as if Discord did not exist. The profile points the webhook at a
 * loopback port nothing listens on, so delivery fails instantly (connection refused) on the
 * notifier's worker thread - the strongest cheap stand-in for "Discord is down".
 */
@QuarkusTest
@TestProfile(ReportEndpointsWebhookDownTest.WebhookPointingAtAClosedPort.class)
@QuarkusTestResource(OidcWiremockTestResource.class)
public class ReportEndpointsWebhookDownTest {

    public static class WebhookPointingAtAClosedPort implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            // Port 1 is privileged and never bound in CI or dev: connect() is refused immediately,
            // so the test exercises the failure path without ever waiting on a timeout.
            return Map.of("discord.report.webhook-url", "http://127.0.0.1:1/webhook");
        }
    }

    @Test
    public void sendReport_webhookConfiguredButDown_responseIsUnchanged() {
        given()
                .auth().oauth2(OidcWiremockTestResource.getAccessToken("alice", Set.of("user")))
                .contentType(MediaType.APPLICATION_JSON)
                .body("{\"message\":\"a bug\",\"logs\":\"stacktrace\",\"device\":\"pc\"}")
                .when().post("/report/send")
                .then()
                .statusCode(200);
    }
}
