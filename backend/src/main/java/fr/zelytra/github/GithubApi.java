package fr.zelytra.github;

import com.google.gson.Gson;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

/**
 * The Windows installer link behind {@code /github/release/download}, read from the public
 * {@code latest.json} the release workflow publishes (no API token: this is a plain CDN download,
 * not api.github.com).
 * <p>
 * It used to fetch exactly once, in the constructor, so the link stayed frozen at whatever release
 * was current when the process last restarted - and a GitHub hiccup during that single call failed
 * bean creation outright, i.e. the whole application (#868). It now follows the same shape as its
 * sibling {@link GithubLatestReleaseApi}: lazy on first read, cached for a few minutes, and on
 * failure it serves the last good value - or an empty release when nothing is known yet - rather
 * than throwing.
 */
@ApplicationScoped
public class GithubApi {

    public static final String RELEASE_URL = "https://github.com/zelytra/BetterFleet/releases/latest/download/latest.json";

    /** How long a fetched release stays fresh. Five minutes, like the sibling endpoint. */
    public static final long CACHE_TTL_MILLIS = 300_000;

    /**
     * How long a FAILED fetch is remembered. Shorter than the success TTL - an outage should heal
     * quickly - but non-zero, so a GitHub that is down is not re-dialled on every single request.
     */
    public static final long NEGATIVE_CACHE_TTL_MILLIS = 30_000;

    private static final GithubRelease EMPTY = new GithubRelease();

    // Seams, package-visible so tests drive the clock and the network instead of sleeping and
    // dialling out. Production reads the wall clock and the real URL.
    LongSupplier clock = System::currentTimeMillis;
    ReleaseFetcher fetcher = () -> getJsonString(new URL(RELEASE_URL));

    /** The one network call this class makes, isolated so a test can replace it. */
    @FunctionalInterface
    interface ReleaseFetcher {
        String fetch() throws IOException;
    }

    // One refresher at a time; everyone else serves the current value instead of queueing behind a
    // slow fetch.
    private final ReentrantLock refreshLock = new ReentrantLock();

    private volatile GithubRelease cached;
    private volatile long cachedAtMillis;
    private volatile boolean cachedIsError;

    public GithubRelease getGithubRelease() {
        if (isFresh()) {
            return current();
        }
        if (!refreshLock.tryLock()) {
            return current();
        }
        try {
            // Another thread may have refreshed between the check above and this lock.
            if (isFresh()) {
                return current();
            }
            try {
                GithubRelease fresh = parseGithubRelease(fetcher.fetch());
                cached = fresh;
                stamp(false);
                return fresh;
            } catch (Exception e) {
                Log.error("[GITHUB] Failed to read the latest release manifest", e);
                stamp(true);
                return current();
            }
        } finally {
            refreshLock.unlock();
        }
    }

    private boolean isFresh() {
        // Coldness is read from the cache's own state, never from a sentinel timestamp: a test
        // driving the clock from 0 proved that `cachedAtMillis == 0` means "never fetched" AND
        // "fetched at zero", so the cache re-fetched on every call. Same shape as the sibling.
        if (cached == null && !cachedIsError) {
            return false; // never fetched
        }
        long ttl = cachedIsError ? NEGATIVE_CACHE_TTL_MILLIS : CACHE_TTL_MILLIS;
        return (clock.getAsLong() - cachedAtMillis) < ttl;
    }

    private void stamp(boolean isError) {
        cachedAtMillis = clock.getAsLong();
        cachedIsError = isError;
    }

    private GithubRelease current() {
        return cached != null ? cached : EMPTY;
    }

    public static GithubRelease parseGithubRelease(String jsonString) {
        // Parse JSON response
        Gson gson = new Gson();
        TauriRelease tauriRelease = gson.fromJson(jsonString, TauriRelease.class);

        GithubRelease githubRelease = new GithubRelease();
        githubRelease.setVersion(tauriRelease.version());
        githubRelease.setUrl(tauriRelease.platforms().get("windows-x86_64").url().replace("nsis.zip", "exe"));

        return githubRelease;
    }

    private static String getJsonString(URL url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();

        // Now it's "open", we can set the request method, headers etc.
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestMethod("GET");

        // This line makes the request
        BufferedReader in = new BufferedReader(new InputStreamReader(connection.getInputStream()));
        String inputLine;
        StringBuilder content = new StringBuilder();
        while ((inputLine = in.readLine()) != null) {
            content.append(inputLine);
        }

        // Close the connections
        in.close();
        connection.disconnect();

        // Convert the StringBuffer to a string
        return content.toString();
    }
}
