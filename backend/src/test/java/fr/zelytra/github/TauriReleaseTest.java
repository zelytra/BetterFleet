package fr.zelytra.github;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@QuarkusTest
public class TauriReleaseTest {

    @Test
    public void testTauriRelease() {
        // Setup
        String expectedVersion = "1.0.0";
        Map<String, Platform> expectedPlatforms = new HashMap<>();
        expectedPlatforms.put("windows-x86_64", new Platform("Windows-x86_64", "https://example.com/windows-x86_64.exe"));

        // Action
        TauriRelease tauriRelease = new TauriRelease(expectedVersion, expectedPlatforms);

        // Assert
        assertEquals(expectedVersion, tauriRelease.version(), "The version should match the expected value");
        assertTrue(tauriRelease.platforms().containsKey("windows-x86_64"), "The platforms map should contain the key for windows-x86_64");
        assertEquals(expectedPlatforms.get("windows-x86_64").signature(), tauriRelease.platforms().get("windows-x86_64").signature(), "The signature for windows-x86_64 should match the expected value");
        assertEquals(expectedPlatforms.get("windows-x86_64").url(), tauriRelease.platforms().get("windows-x86_64").url(), "The URL for windows-x86_64 should match the expected value");
    }
}
