package fr.zelytra.github;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure, offline unit tests for the release proxy.
 * <p>
 * Two seams keep the suite deterministic and network-free. The JSON mapping is exercised through the
 * static {@link GithubLatestReleaseApi#parseLatestRelease(String)} against captured GitHub payloads,
 * and the cache/failure behaviour is exercised through a {@link CountingApi} that stubs the network
 * fetch and drives a controllable clock, so nothing here touches api.github.com.
 */
class GithubLatestReleaseApiTest {

    // A realistic api.github.com releases/latest payload for a 2.3.0 build: the four package formats
    // the download page resolves, plus the Tauri updater manifest that rides along in the release
    // (which the page ignores). Notably the pacman package's version is "2.3.0-1", NOT expressible
    // from the tag, which the old fixed-name proxy could never have constructed.
    private static final String RELEASE_JSON = """
            {
              "tag_name": "v2.3.0",
              "name": "BetterFleet 2.3.0",
              "prerelease": false,
              "assets": [
                {
                  "name": "BetterFleet_2.3.0_x64-setup.exe",
                  "size": 9400000,
                  "browser_download_url": "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet_2.3.0_x64-setup.exe"
                },
                {
                  "name": "BetterFleet_2.3.0_amd64.deb",
                  "size": 7800000,
                  "browser_download_url": "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet_2.3.0_amd64.deb"
                },
                {
                  "name": "BetterFleet-2.3.0-1.x86_64.rpm",
                  "size": 7900000,
                  "browser_download_url": "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet-2.3.0-1.x86_64.rpm"
                },
                {
                  "name": "betterfleet-bin-2.3.0-1-x86_64.pkg.tar.zst",
                  "size": 8100000,
                  "browser_download_url": "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/betterfleet-bin-2.3.0-1-x86_64.pkg.tar.zst"
                },
                {
                  "name": "latest.json",
                  "size": 1200,
                  "browser_download_url": "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/latest.json"
                }
              ]
            }
            """;

    // --- Contract: the response covers every package format the download page resolves ---

    @Test
    void parseLatestRelease_coversEveryPackageFormatTheDownloadPageResolves() {
        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease(RELEASE_JSON);

        assertEquals("2.3.0", release.version(), "the leading v of the tag must be stripped");

        // Every extension the website's download tiles resolve (DownloadPage.vue) must be present, or
        // a tile silently blanks to "coming soon" even though the file shipped. Adding or dropping a
        // package format now fails here instead of at a visitor's browser.
        ReleaseAsset exe = require(release, ".exe");
        assertEquals("BetterFleet_2.3.0_x64-setup.exe", exe.name());
        assertEquals(
                "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet_2.3.0_x64-setup.exe",
                exe.url(), "the asset URL must be GitHub's browser_download_url, verbatim");
        assertEquals(9_400_000L, exe.size());

        require(release, ".deb");
        require(release, ".rpm");

        // The Arch package is matched on the full .pkg.tar.zst suffix; its "2.3.0-1" version is why a
        // fixed {version} template could never have named it.
        ReleaseAsset arch = require(release, ".pkg.tar.zst");
        assertEquals("betterfleet-bin-2.3.0-1-x86_64.pkg.tar.zst", arch.name());
        assertEquals(8_100_000L, arch.size());
    }

    @Test
    void parseLatestRelease_returnsEveryAssetTheReleaseCarries() {
        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease(RELEASE_JSON);
        // All five assets pass through, in order: the page filters by extension, the proxy does not
        // pre-filter (a future format appears the moment a release carries it).
        assertEquals(5, release.assets().size());
        assertEquals("BetterFleet_2.3.0_x64-setup.exe", release.assets().get(0).name());
        assertEquals("latest.json", release.assets().get(4).name());
    }

    // --- Guards: pre-release, missing tag, malformed assets ---

    @Test
    void parseLatestRelease_returnsEmptyForAPreRelease() {
        // Defense in depth: releases/latest already skips pre-releases, but a version carrying a
        // pre-release suffix must never be served even if it somehow reaches the parser.
        String json = """
                {
                  "tag_name": "v2.3.0-rc.3",
                  "assets": [
                    { "name": "BetterFleet_2.3.0_x64-setup.exe", "size": 1, "browser_download_url": "https://example.com/x.exe" }
                  ]
                }
                """;

        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease(json);

        assertEquals("", release.version(), "a pre-release must resolve to the empty release");
        assertTrue(release.assets().isEmpty(), "a pre-release must serve nothing, even carrying assets");
    }

    @Test
    void parseLatestRelease_returnsEmptyWhenTheTagIsMissing() {
        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease("{ \"assets\": [] }");

        assertEquals("", release.version());
        assertTrue(release.assets().isEmpty());
    }

    @Test
    void parseLatestRelease_skipsAssetsMissingANameOrUrl() {
        String json = """
                {
                  "tag_name": "2.3.0",
                  "assets": [
                    { "name": "ok.deb", "size": 10, "browser_download_url": "https://example.com/ok.deb" },
                    { "size": 20, "browser_download_url": "https://example.com/nameless" },
                    { "name": "urlless.exe", "size": 30 }
                  ]
                }
                """;

        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease(json);

        assertEquals(1, release.assets().size(), "an asset missing its name or URL must be skipped");
        assertEquals("ok.deb", release.assets().get(0).name());
    }

    @Test
    void parseLatestRelease_keepsAnAssetWhoseSizeIsAbsent_asZero() {
        // A real, downloadable asset whose size GitHub omits surfaces as size 0, still included: it
        // must not be mistaken for missing.
        String json = """
                {
                  "tag_name": "2.3.0",
                  "assets": [
                    { "name": "BetterFleet_2.3.0_x64-setup.exe", "browser_download_url": "https://example.com/x.exe" }
                  ]
                }
                """;

        LatestRelease release = GithubLatestReleaseApi.parseLatestRelease(json);

        assertEquals(1, release.assets().size());
        assertEquals(0L, release.assets().get(0).size());
    }

    // --- Cache: TTL, expiry, failure degradation, negative TTL, in-flight refresh ---

    @Test
    void aSecondCallWithinTheTtlServesTheCacheWithoutRefetching() {
        AtomicLong now = new AtomicLong(1_000);
        CountingApi api = api(now);

        LatestRelease first = api.getLatestRelease();
        now.addAndGet(4_999); // still inside the 5s TTL
        LatestRelease second = api.getLatestRelease();

        assertEquals(1, api.builds.get(), "a call within the TTL must not re-fetch");
        assertSame(first, second, "the same cached instance is served");
    }

    @Test
    void anExpiredCacheRefetches() {
        AtomicLong now = new AtomicLong(1_000);
        CountingApi api = api(now);

        api.getLatestRelease();
        now.addAndGet(5_001); // just past the TTL
        api.getLatestRelease();

        assertEquals(2, api.builds.get(), "a call after the TTL must re-fetch");
    }

    @Test
    void aFailedRefreshWithAWarmCacheServesTheLastGoodValue() {
        AtomicLong now = new AtomicLong(1_000);
        CountingApi api = api(now);

        LatestRelease good = api.getLatestRelease(); // build 1, success
        assertTrue(!good.assets().isEmpty());

        now.addAndGet(5_001); // expire
        api.fail = true;
        LatestRelease served = api.getLatestRelease(); // build 2, fails

        assertEquals(2, api.builds.get());
        assertSame(good, served, "a failed refresh must serve the last good value, not error");
    }

    @Test
    void aColdCacheFailureServesAnEmptyRelease_notAnError() {
        CountingApi api = api(new AtomicLong(1_000));
        api.fail = true;

        LatestRelease served = assertDoesNotThrow(api::getLatestRelease);

        assertEquals("", served.version(), "a cold-cache failure must degrade to the empty release");
        assertTrue(served.assets().isEmpty());
        assertEquals(1, api.builds.get());
    }

    @Test
    void aFailedFetchIsRememberedForTheNegativeTtl_boundingRetriesByTimeNotTraffic() {
        AtomicLong now = new AtomicLong(1_000);
        CountingApi api = api(now);
        api.fail = true;

        api.getLatestRelease(); // build 1: fails, stamps the negative TTL
        now.addAndGet(500);     // within the 1s negative TTL
        api.getLatestRelease(); // must NOT re-fetch: an outage is retried on a timer, not per request
        assertEquals(1, api.builds.get(), "a failure must be remembered for the negative TTL");

        now.addAndGet(600);     // total 1100 > the 1s negative TTL
        api.getLatestRelease(); // now it retries
        assertEquals(2, api.builds.get(), "once the negative TTL lapses, the next request retries");
    }

    @Test
    void aRefreshInFlightIsNotJoined_otherCallersGetTheCurrentValueAtOnce() throws Exception {
        AtomicLong now = new AtomicLong(1_000);
        CountingApi api = api(now);

        LatestRelease warm = api.getLatestRelease(); // build 1, no blocking
        assertEquals(1, api.builds.get());

        // Let it go stale, then make the next build block so an in-flight refresh can be observed.
        now.addAndGet(5_001);
        api.entered = new CountDownLatch(1);
        api.proceed = new CountDownLatch(1);

        Thread refresher = new Thread(api::getLatestRelease);
        refresher.start();
        assertTrue(api.entered.await(1, TimeUnit.SECONDS), "the refresh must have reached the build");
        int buildsWhileInFlight = api.builds.get(); // 2: the warm build plus the blocked refresh

        // A second caller must not queue behind the in-flight refresh: it serves the current value now.
        LatestRelease served = api.getLatestRelease();
        assertSame(warm, served, "an in-flight refresh must not block other callers");
        assertEquals(buildsWhileInFlight, api.builds.get(),
                "an in-flight refresh must not be joined by a second build");

        api.proceed.countDown();
        refresher.join(2_000);
    }

    // --- helpers ---

    private static ReleaseAsset require(LatestRelease release, String ext) {
        return release.assets().stream()
                .filter(asset -> asset.name().toLowerCase().endsWith(ext))
                .findFirst()
                .orElseThrow(() -> new AssertionError(
                        "No asset ending in " + ext + " in " + release.assets()));
    }

    // A CountingApi wired to a controllable clock with short, test-friendly TTLs.
    private static CountingApi api(AtomicLong clock) {
        CountingApi api = new CountingApi();
        api.clock = clock::get;
        api.cacheTtlMillis = 5_000;
        api.negativeCacheTtlMillis = 1_000;
        return api;
    }

    /**
     * Stubs the network fetch so the cache and failure behaviour can be driven deterministically:
     * counts builds, can be told to fail, and can block mid-build (via the latches) to model a
     * refresh that is still in flight.
     */
    private static final class CountingApi extends GithubLatestReleaseApi {
        final AtomicInteger builds = new AtomicInteger();
        volatile boolean fail = false;
        volatile LatestRelease toReturn = new LatestRelease("2.3.0", List.of(new ReleaseAsset(
                "BetterFleet_2.3.0_x64-setup.exe", 9_400_000L,
                "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet_2.3.0_x64-setup.exe")));
        volatile CountDownLatch entered;
        volatile CountDownLatch proceed;

        @Override
        LatestRelease buildLatestRelease() throws IOException {
            builds.incrementAndGet();
            if (entered != null) {
                entered.countDown();
            }
            if (proceed != null) {
                try {
                    proceed.await(2, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }
            if (fail) {
                throw new IOException("simulated GitHub outage");
            }
            return toReturn;
        }
    }
}
