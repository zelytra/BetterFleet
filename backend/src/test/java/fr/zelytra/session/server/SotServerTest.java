package fr.zelytra.session.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * The hash is a server's identity: the fleet groups players under it, so anything that changes the
 * hash changes who is shown sailing together. The client reports the per-server session-coordinator
 * endpoint (ip:port), so the hash keys on ip:port. These guard that grouping against #364.
 */
class SotServerTest {

    /**
     * #364 case A: four players on DIFFERENT ships but the same server all report the one session
     * endpoint everyone on a world instance shares (20.33.49.115:31260). They must resolve to a
     * single server — that is what makes the alliance show as one card.
     */
    @Test
    void oneSessionEndpointIsOneServerForEveryoneOnIt() {
        String sessionIp = "20.33.49.115";
        int sessionPort = 31260;

        String first = new SotServer(sessionIp, sessionPort).generateHash();
        for (int i = 0; i < 4; i++) {
            assertEquals(first, new SotServer(sessionIp, sessionPort).generateHash(),
                    "the shared session endpoint must be one server for everyone on it");
        }
    }

    @Test
    void differentServersOnOneAzureHostAreDifferentServers() {
        // #364 cases B/D: two players on DIFFERENT servers that happen to share one Azure game host
        // (51.103.72.36). Their session endpoints differ, so they must NOT merge into one card —
        // this is the false positive #364 was reopened for.
        assertNotEquals(
                new SotServer("20.157.18.137", 30735).generateHash(),
                new SotServer("20.157.115.138", 30987).generateHash());
    }

    @Test
    void theSessionPortIsPartOfTheIdentity() {
        // #364 cases E/F: the same session IP (20.33.6.37) recurs across two different servers on
        // different ports. Hashing the IP alone would merge them, so the port must count.
        assertNotEquals(
                new SotServer("20.33.6.37", 31127).generateHash(),
                new SotServer("20.33.6.37", 30879).generateHash());
    }
}
