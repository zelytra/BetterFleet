package fr.zelytra.session;

import fr.zelytra.session.fleet.Fleet;
import fr.zelytra.session.player.Player;
import fr.zelytra.session.server.SotServer;
import fr.zelytra.statistics.AllianceAttempt;
import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit test of the anonymized attempt outcome (issue #673). buildAttempt is pure — it only reads the
 * fleet — so it needs no Quarkus context.
 */
class AllianceAttemptBuilderTest {

    private Player player(String name, boolean master, String country) {
        Player p = new Player();
        p.setUsername(name);
        p.setMaster(master);
        p.setCountry(country);
        return p;
    }

    private SotServer server(String ip, String country, int players) {
        SotServer s = new SotServer(ip, 30000);
        s.setCountryCode(country);
        for (int i = 0; i < players; i++) {
            s.getConnectedPlayers().add(player("p" + i, false, null));
        }
        return s;
    }

    @Test
    void oneServerIsAConvergedAttemptWithTheOwnerRegion() {
        Fleet fleet = new Fleet();
        fleet.getPlayers().add(player("Host", true, "fr"));
        fleet.getStats().setTryAmount(2);
        fleet.getServers().put("s1", server("1.1.1.1", "xx", 3));

        AllianceAttempt a = new SessionManager().buildAttempt(fleet, Instant.EPOCH);

        assertTrue(a.converged);
        assertEquals(1, a.distinctServers);
        assertEquals(3, a.largestGroup);
        assertEquals(3, a.players);
        assertEquals("fr", a.ownerRegion, "owner region is the master's country, not the server's");
        assertEquals("xx", a.serverRegion, "server region is still recorded separately");
        assertEquals(2, a.tryNumber);
    }

    @Test
    void twoServersIsNotConverged() {
        Fleet fleet = new Fleet();
        fleet.getPlayers().add(player("Host", true, "de"));
        fleet.getServers().put("s1", server("1.1.1.1", "gb", 2));
        fleet.getServers().put("s2", server("2.2.2.2", "us", 1));

        AllianceAttempt a = new SessionManager().buildAttempt(fleet, Instant.EPOCH);

        assertFalse(a.converged);
        assertEquals(2, a.distinctServers);
        assertEquals(2, a.largestGroup, "largest group is the biggest server");
        assertEquals(3, a.players);
    }

    @Test
    void statsAreSharedByDefault() {
        // A pre-#673 client never sends the flag; Jackson keeps the initialized true, so a fleet
        // of old clients keeps contributing.
        Fleet fleet = new Fleet();
        fleet.getPlayers().add(player("Host", true, "fr"));
        fleet.getPlayers().add(player("Mate", false, null));

        assertFalse(new SessionManager().statsWithheld(fleet));
    }

    @Test
    void aMasterOptingOutWithholdsTheWholeSession() {
        Fleet fleet = new Fleet();
        Player host = player("Host", true, "fr");
        host.setShareStats(false);
        fleet.getPlayers().add(host);
        fleet.getPlayers().add(player("Mate", false, null));

        assertTrue(new SessionManager().statsWithheld(fleet),
                "the owner region is the master's datum — their opt-out withholds the row");
    }

    @Test
    void aRegularPlayerOptingOutDoesNotWithholdTheSession() {
        // Non-masters contribute nothing but an anonymous head-count; the session keeps counting.
        Fleet fleet = new Fleet();
        fleet.getPlayers().add(player("Host", true, "fr"));
        Player mate = player("Mate", false, null);
        mate.setShareStats(false);
        fleet.getPlayers().add(mate);

        assertFalse(new SessionManager().statsWithheld(fleet));
    }
}
