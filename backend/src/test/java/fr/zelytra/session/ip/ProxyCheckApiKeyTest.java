package fr.zelytra.session.ip;

import io.quarkus.test.junit.QuarkusTest;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The proxycheck.io token is configuration, and configuration must reach the client that needs it
 * without a detour through shared mutable state (#868).
 * <p>
 * It used to live in {@code SessionSocket.PROXY_API_KEY}, a {@code public static String} reassigned
 * on every JOIN_SERVER frame purely so {@code buildUrl} could read it statically. The consequence
 * was not theoretical: any geolocation happening before the first JOIN_SERVER of the process - the
 * server-join path is not the only caller - built its URL with an empty token and silently used the
 * free tier, and the value was written from every websocket thread with no synchronisation.
 */
@QuarkusTest
class ProxyCheckApiKeyTest {

    @Inject
    ProxyCheckAPI proxyCheckAPI;

    @ConfigProperty(name = "proxy.check.api.key")
    String configuredKey;

    @Test
    void theTokenIsCarriedFromConfigurationWithoutAnyJoinServerFrame() {
        // Nothing in this test opens a websocket or sends JOIN_SERVER: the client must already
        // hold the configured token, because that is where configuration comes from.
        String url = proxyCheckAPI.requestUrlFor("1.2.3.4");

        assertTrue(url.startsWith("https://proxycheck.io/v2/1.2.3.4?"), url);
        if (configuredKey.isEmpty()) {
            assertTrue(!url.contains("key="), "no token configured, so none should be sent: " + url);
        } else {
            assertTrue(url.contains("key=" + configuredKey), "the configured token must be sent: " + url);
        }
    }

    @Test
    void theKeyIsNotReachableAsMutableGlobalState() throws Exception {
        // The shape guard: a public static holding a credential is a configuration channel anyone
        // can write to, and it is what this fix removes.
        for (var field : Class.forName("fr.zelytra.session.SessionSocket").getDeclaredFields()) {
            assertTrue(
                    !field.getName().equals("PROXY_API_KEY"),
                    "SessionSocket.PROXY_API_KEY is back: the token must be injected into "
                            + "ProxyCheckAPI, not laundered through shared mutable state");
        }
    }
}
