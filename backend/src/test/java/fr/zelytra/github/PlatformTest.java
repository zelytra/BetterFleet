package fr.zelytra.github;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class PlatformTest {

    @Test
    public void testPlatform() {
        // Setup
        String expectedSignature = "Windows-x86_64";
        String expectedUrl = "https://example.com/windows-x86_64.exe";

        // Action
        Platform platform = new Platform(expectedSignature, expectedUrl);

        // Assert
        assertEquals(expectedSignature, platform.signature(), "The signature should match the expected value");
        assertEquals(expectedUrl, platform.url(), "The URL should match the expected value");
    }
}
