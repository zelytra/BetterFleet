package fr.zelytra.github;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class LatestReleaseTest {

    @Test
    public void testLatestRelease() {
        // Setup
        String expectedVersion = "2.4.1";
        ReleaseAsset expectedAsset = new ReleaseAsset(
                "BetterFleet_2.4.1_x64-setup.exe", 8388608L, "https://example.com/setup.exe");

        // Action
        LatestRelease release = new LatestRelease(expectedVersion, List.of(expectedAsset));

        // Assert
        assertEquals(expectedVersion, release.version(), "The version should match the expected value");
        assertEquals(1, release.assets().size(), "The assets list should hold the single asset");
        assertEquals(expectedAsset, release.assets().get(0), "The asset should match the expected value");
    }
}
