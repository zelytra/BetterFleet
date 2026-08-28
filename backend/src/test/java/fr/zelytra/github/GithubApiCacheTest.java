package fr.zelytra.github;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * {@code /github/release/download} used to serve whatever release was current when the process
 * started: {@link GithubApi} fetched once in its constructor and never again, so the download link
 * stayed frozen at the last restart - and a GitHub hiccup during that one call failed bean creation
 * outright (#868).
 * <p>
 * Same shape as its sibling {@link GithubLatestReleaseApi}: lazy, TTL-cached, degrading to the last
 * good value on failure. These tests drive the clock rather than sleeping, and count fetches
 * instead of hitting the network.
 */
class GithubApiCacheTest {

    private static String releaseJson(String version) {
        return "{\"version\":\"" + version + "\",\"platforms\":{\"windows-x86_64\":"
                + "{\"url\":\"https://github.com/zelytra/BetterFleet/releases/download/v" + version
                + "/BetterFleet_" + version + "_x64-setup.nsis.zip\"}}}";
    }

    /** A GithubApi whose fetch and clock are controllable. */
    private static GithubApi withFetch(AtomicReference<String> body, AtomicInteger fetches, AtomicLong now) {
        GithubApi api = new GithubApi();
        api.clock = now::get;
        api.fetcher = () -> {
            fetches.incrementAndGet();
            String value = body.get();
            if (value == null) {
                throw new IOException("GitHub is down");
            }
            return value;
        };
        return api;
    }

    @Test
    void constructionNeverTouchesTheNetwork() {
        AtomicInteger fetches = new AtomicInteger();
        withFetch(new AtomicReference<>(releaseJson("2.4.1")), fetches, new AtomicLong(0));

        assertEquals(0, fetches.get(), "building the bean must not couple boot to GitHub");
    }

    @Test
    void theReleaseRefreshesOnceTheCacheExpires() {
        AtomicReference<String> body = new AtomicReference<>(releaseJson("2.4.1"));
        AtomicInteger fetches = new AtomicInteger();
        AtomicLong now = new AtomicLong(0);
        GithubApi api = withFetch(body, fetches, now);

        assertEquals("2.4.1", api.getGithubRelease().getVersion());
        assertEquals(1, fetches.get(), "the first read fetches");

        // A new release ships while the process keeps running - the whole point of #868.
        body.set(releaseJson("2.5.0"));
        assertEquals("2.4.1", api.getGithubRelease().getVersion(), "within the TTL, the cache serves");
        assertEquals(1, fetches.get(), "and does not re-fetch");

        now.addAndGet(GithubApi.CACHE_TTL_MILLIS + 1);
        assertEquals("2.5.0", api.getGithubRelease().getVersion(), "past the TTL, the new release shows");
    }

    @Test
    void aGithubOutageServesTheLastGoodValueInsteadOfFailing() {
        AtomicReference<String> body = new AtomicReference<>(releaseJson("2.4.1"));
        AtomicInteger fetches = new AtomicInteger();
        AtomicLong now = new AtomicLong(0);
        GithubApi api = withFetch(body, fetches, now);
        assertEquals("2.4.1", api.getGithubRelease().getVersion());

        body.set(null); // GitHub is down
        now.addAndGet(GithubApi.CACHE_TTL_MILLIS + 1);

        GithubRelease during = api.getGithubRelease();
        assertNotNull(during);
        assertEquals("2.4.1", during.getVersion(), "an outage must not lose the known release");
    }

    @Test
    void anOutageBeforeAnySuccessYieldsAnEmptyReleaseRatherThanAnException() {
        // The old constructor threw here and took the whole bean - and the app - with it.
        GithubApi api = withFetch(new AtomicReference<>(null), new AtomicInteger(), new AtomicLong(0));

        GithubRelease release = api.getGithubRelease();
        assertNotNull(release, "a cold cache during an outage must still answer");
        assertTrue(
                release.getVersion() == null || release.getVersion().isEmpty(),
                "with nothing known yet, the release is empty rather than invented");
    }

    @Test
    void aFailedRefreshIsNotRetriedOnEverySingleRequest() {
        AtomicReference<String> body = new AtomicReference<>(releaseJson("2.4.1"));
        AtomicInteger fetches = new AtomicInteger();
        AtomicLong now = new AtomicLong(0);
        GithubApi api = withFetch(body, fetches, now);
        api.getGithubRelease();

        body.set(null);
        now.addAndGet(GithubApi.CACHE_TTL_MILLIS + 1);
        api.getGithubRelease();
        int afterFirstFailure = fetches.get();

        // Immediately after a failure, requests serve the cached value instead of hammering a
        // GitHub that is already down.
        api.getGithubRelease();
        api.getGithubRelease();
        assertEquals(afterFirstFailure, fetches.get(), "a down GitHub must not be retried per request");
    }
}
