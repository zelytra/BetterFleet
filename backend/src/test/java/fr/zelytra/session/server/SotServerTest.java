package fr.zelytra.session.server;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;

/**
 * The hash is a server's identity: the fleet groups players under it, so anything that changes the
 * hash changes who is shown sailing together. These guard that grouping against the bug in #364.
 */
class SotServerTest {

    /**
     * The #364 capture, verbatim: four players who were demonstrably on one Sea of Thieves server
     * were split into four cards, because each client talks to the same host on its own UDP port and
     * the hash folded the port in. They must now resolve to a single server.
     */
    @Test
    void sameHostOnDifferentPortsIsOneServer() {
        String host = "51.103.45.67";
        int[] perClientPorts = {30970, 31106, 31242, 31310};

        String first = new SotServer(host, perClientPorts[0]).generateHash();
        for (int port : perClientPorts) {
            assertEquals(first, new SotServer(host, port).generateHash(),
                    "same host " + host + " on port " + port + " must be the same server");
        }
    }

    @Test
    void differentHostsAreDifferentServers() {
        // The two hosts from the same captures: the busy game server, and the sparse shared endpoint
        // (matchmaking / SDR relay) every player also touches. They are genuinely different servers
        // and must not merge — this is the guard against over-collapsing to a single card.
        assertNotEquals(
                new SotServer("51.103.45.67", 30970).generateHash(),
                new SotServer("20.33.49.115", 31260).generateHash());
    }

    @Test
    void theHashDependsOnlyOnTheHost() {
        // Whatever port a client happens to draw, the server it names is the same one — so the hash
        // has to be a function of the host alone, or the identity flaps as ports change between runs.
        assertEquals(
                new SotServer("172.166.255.146", 40001).generateHash(),
                new SotServer("172.166.255.146", 65535).generateHash());
    }
}
