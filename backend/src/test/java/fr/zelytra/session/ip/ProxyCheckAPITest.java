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
                + "\"region\":\"Île-de-France\","
                + "\"city\":\"Paris\"}}";

        // Accented characters must survive parsing intact (the reader now decodes UTF-8).
        assertEquals("Europe - France - Île-de-France - Paris",
                ProxyCheckAPI.parseLocation(json, "1.1.1.1"));
    }

    @Test
    public void parseLocation_rateLimitedResponse_returnsEmptyString() {
        // proxycheck.io returns a non-"ok" status once the free-tier limit is hit.
        String json = "{\"status\":\"denied\",\"message\":\"free limit reached\"}";

        assertEquals("", ProxyCheckAPI.parseLocation(json, "1.1.1.1"));
    }

    @Test
    public void parseLocation_missingFields_keepsThePresentOnesInsteadOfBlanking() {
        // Datacenter/Azure IPs (SoT game servers) often omit some geo fields. The
        // present ones must still be returned instead of the whole location coming back
        // empty — the old getString() threw on the missing "continent"/"city" and
        // blanked everything (regression seen after issue #364's detection fix).
        String json = "{"
                + "\"status\":\"ok\","
                + "\"20.216.150.173\":{"
                + "\"country\":\"United States\","
                + "\"region\":\"Virginia\"}}";

        assertEquals("United States - Virginia",
                ProxyCheckAPI.parseLocation(json, "20.216.150.173"));
    }

    @Test
    public void parseLocation_okButNoEntryForIp_returnsEmptyString() {
        String json = "{\"status\":\"ok\"}";

        assertEquals("", ProxyCheckAPI.parseLocation(json, "20.216.150.173"));
    }

    @Test
    public void parseGeo_okResponse_exposesIsoCountryCodeLowercased() {
        // The public sessions directory (#599) needs the ISO country code for the flag, lowercased
        // to match the frontend flag map (LangIcons).
        String json = "{"
                + "\"status\":\"ok\","
                + "\"20.216.148.125\":{"
                + "\"country\":\"United States\","
                + "\"isocode\":\"US\","
                + "\"region\":\"Virginia\"}}";

        ProxyCheckAPI.Geo geo = ProxyCheckAPI.parseGeo(json, "20.216.148.125");
        assertEquals("us", geo.countryCode(), "isocode must be exposed lowercased");
        assertEquals("United States - Virginia", geo.location());
    }
}
