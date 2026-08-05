package fr.zelytra.github;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class ReleaseAssetTest {

    @Test
    public void testReleaseAsset() {
        // Setup
        String expectedName = "BetterFleet_2.4.1_x64-setup.exe";
        long expectedSize = 8388608L;
        String expectedUrl = "https://example.com/BetterFleet_2.4.1_x64-setup.exe";

        // Action
        ReleaseAsset asset = new ReleaseAsset(expectedName, expectedSize, expectedUrl);

        // Assert
        assertEquals(expectedName, asset.name(), "The name should match the expected value");
        assertEquals(expectedSize, asset.size(), "The size should match the expected value");
        assertEquals(expectedUrl, asset.url(), "The URL should match the expected value");
    }
}
