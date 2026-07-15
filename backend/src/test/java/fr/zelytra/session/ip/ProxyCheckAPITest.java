package fr.zelytra.session.ip;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Exercises the real proxycheck.io response parsing (the location string it builds and the
 * free-tier limit handling) rather than mocking the whole call, and stays offline by feeding
 * fixtures to the pure {@link ProxyCheckAPI#parseLocation(String, String)} helper.
 */
@QuarkusTest
public class ProxyCheckAPITest {

    @Test
    public void parseLocation_okResponse_buildsFullLocationString() {
        String json = "{"
                + "\"status\":\"ok\","
                + "\"1.1.1.1\":{"
                + "\"continent\":\"Europe\","
                + "\"country\":\"France\","
                + "\"region\":\"Ile-de-France\","
                + "\"city\":\"Paris\"}}";

        assertEquals("Europe - France - Ile-de-France - Paris",
                ProxyCheckAPI.parseLocation(json, "1.1.1.1"));
    }

    @Test
    public void parseLocation_rateLimitedResponse_returnsEmptyString() {
        // proxycheck.io returns a non-"ok" status once the free-tier limit is hit.
        String json = "{\"status\":\"denied\",\"message\":\"free limit reached\"}";

        assertEquals("", ProxyCheckAPI.parseLocation(json, "1.1.1.1"));
    }
}
