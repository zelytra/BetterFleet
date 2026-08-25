package fr.zelytra.session;

import org.junit.jupiter.api.Test;

import java.util.List;

import static fr.zelytra.session.SessionSocket.isSupportedClientVersion;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * The client-version gate, tested as the pure rule it is. The allowlist kicks clients whose
 * release was pruned; the one asymmetry is that a client NEWER than the newest listed release is
 * always accepted - "outdated" means old, and the only source of future builds is the
 * maintainer's own release candidates, which must be able to join a production backend that
 * predates them (the backend deploy follows the release, it cannot precede it).
 */
class ClientVersionGateTest {

    private static final List<String> ALLOWED = List.of("2.2.0", "2.3.0", "2.3.1", "2.3.2", "2.3.3");

    @Test
    void aListedReleaseConnects() {
        assertTrue(isSupportedClientVersion("2.3.3", ALLOWED));
        assertTrue(isSupportedClientVersion("2.2.0", ALLOWED));
    }

    @Test
    void anRcOfAListedReleaseConnects() {
        assertTrue(isSupportedClientVersion("2.3.0-rc.3", ALLOWED));
    }

    @Test
    void anRcOfAnUnreleasedNewerVersionConnects() {
        // The case that locked the 2.4.0 release candidates out of production: base 2.4.0 was not
        // in the list, but it is newer than everything the list knows.
        assertTrue(isSupportedClientVersion("2.4.0-rc.2", ALLOWED));
    }

    @Test
    void aNewerStableConnectsEvenBeforeTheBackendLearnsIt() {
        assertTrue(isSupportedClientVersion("2.4.0", ALLOWED));
        assertTrue(isSupportedClientVersion("3.0.0", ALLOWED));
        // Newer on the patch digit alone is still newer.
        assertTrue(isSupportedClientVersion("2.3.4", ALLOWED));
    }

    @Test
    void aPrunedOldReleaseIsRefused() {
        // 1.x was dropped from the list: those clients are the ones the gate exists for.
        assertFalse(isSupportedClientVersion("1.4.3", ALLOWED));
        assertFalse(isSupportedClientVersion("1.4.3-rc.1", ALLOWED));
        // Unlisted but older than the newest entry: between listed releases, not newer than them.
        assertFalse(isSupportedClientVersion("2.2.1", ALLOWED));
    }

    @Test
    void garbageIsRefusedNotCrashedOn() {
        assertFalse(isSupportedClientVersion(null, ALLOWED));
        assertFalse(isSupportedClientVersion("", ALLOWED));
        assertFalse(isSupportedClientVersion("dev", ALLOWED));
        assertFalse(isSupportedClientVersion("2.4", ALLOWED));
        assertFalse(isSupportedClientVersion("2.4.x", ALLOWED));
        assertFalse(isSupportedClientVersion("2.4.0.1", ALLOWED));
    }

    @Test
    void anEmptyAllowlistRefusesEveryone() {
        // No newest entry to be newer than: nothing is accepted, nothing throws.
        assertFalse(isSupportedClientVersion("2.4.0", List.of()));
    }

    @Test
    void listEntriesWithSuffixesStillAnchorTheNewestRelease() {
        // An rc-built backend appends its own full version to the list (set-version-from-tag);
        // the newest-release anchor must read through the suffix, not choke on it.
        List<String> withRc = List.of("2.3.3", "2.4.0-rc.1");
        assertTrue(isSupportedClientVersion("2.4.0-rc.2", withRc));
        assertTrue(isSupportedClientVersion("2.4.0", withRc));
        assertFalse(isSupportedClientVersion("2.2.1", withRc));
    }
}
