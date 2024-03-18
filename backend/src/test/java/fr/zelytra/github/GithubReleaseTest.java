package fr.zelytra.github;

import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

@QuarkusTest
public class GithubReleaseTest {

    @Test
    public void testGithubRelease() {
        // Setup
        String expectedVersion = "1.0.0";
        String expectedUrl = "https://example.com/download.exe";

        // Action
        GithubRelease githubRelease = new GithubRelease();
        githubRelease.setVersion(expectedVersion);
        githubRelease.setUrl(expectedUrl);

        // Assert
        assertEquals(expectedVersion, githubRelease.getVersion(), "The version should match the expected value");
        assertEquals(expectedUrl, githubRelease.getUrl(), "The URL should match the expected value");
    }
}