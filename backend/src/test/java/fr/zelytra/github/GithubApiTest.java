package fr.zelytra.github;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Pure unit tests for the Tauri release manifest parsing.
 * <p>
 * These deliberately avoid constructing {@link GithubApi} (whose constructor performs a live
 * network call to GitHub) so the suite stays deterministic and offline-safe. The real parsing
 * logic — including the {@code nsis.zip -> exe} rewrite — is exercised through the static
 * {@link GithubApi#parseGithubRelease(String)} helper.
 */
class GithubApiTest {

    private static final String LATEST_JSON = """
            {
              "version": "1.2.0",
              "notes": "Some release notes",
              "pub_date": "2025-09-21T00:00:00Z",
              "platforms": {
                "windows-x86_64": {
                  "signature": "dW50cnVzdGVkIGNvbW1lbnQ=",
                  "url": "https://github.com/zelytra/BetterFleet/releases/download/v1.2.0/BetterFleet_1.2.0_x64-setup.nsis.zip"
                }
              }
            }
            """;

    @Test
    void parseGithubRelease_extractsVersion() {
        GithubRelease release = GithubApi.parseGithubRelease(LATEST_JSON);

        assertNotNull(release);
        assertEquals("1.2.0", release.getVersion());
    }

    @Test
    void parseGithubRelease_rewritesNsisZipUrlToExe() {
        GithubRelease release = GithubApi.parseGithubRelease(LATEST_JSON);

        assertEquals(
                "https://github.com/zelytra/BetterFleet/releases/download/v1.2.0/BetterFleet_1.2.0_x64-setup.exe",
                release.getUrl());
    }
}
