package fr.zelytra.github;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.Reader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.locks.ReentrantLock;
import java.util.function.LongSupplier;

/**
 * Server-side proxy for the repository's latest release, exposing the version and every attached
 * asset (name, size, direct download URL) via {@link #getLatestRelease()}, feeding the website's
 * download page so it no longer reads GitHub from each visitor's browser (which spent that visitor's
 * anonymous api.github.com quota and left asset tiles stuck on "coming soon" once the limit was hit).
 * <p>
 * The release is read from GitHub's {@code releases/latest} REST endpoint ({@link
 * #LATEST_RELEASE_API_URL}) and its {@code assets[]} array is enumerated as-is: whatever the release
 * actually ships (any OS, any package format: .exe / .deb / .rpm / .pkg.tar.zst and anything a future
 * release adds) is served, rather than guessing a fixed set of file names. Each asset maps 1:1 onto a
 * {@link ReleaseAsset} from its {@code name}, {@code size} and {@code browser_download_url}. The one
 * network call needs a {@code User-Agent} (GitHub rejects requests without one); a token is not
 * required (public releases read anonymously) but {@code github.api.token} should be set in
 * production: anonymous calls share 60 req/h across everything on the server's IP, and hitting that
 * limit made this proxy serve an empty release - the token raises the quota to 5000 req/h.
 * <p>
 * {@code releases/latest} resolves to the newest NON-pre-release, so a release candidate is never
 * served; a pre-release version that somehow reaches the parser is rejected as a second guard. The
 * version comes straight from {@code tag_name}, so nothing here dereferences a platform-specific
 * manifest field (which is what used to NPE the whole payload).
 * <p>
 * Building is lazy (first request, then on cache expiry) so the bean never couples boot to network
 * availability, and the assembled result is {@linkplain #cacheTtlMillis cached} for a few minutes so
 * many visitors collapse into roughly one refresh per window. Exactly one thread refreshes at a time
 * ({@link #refreshLock}, {@code tryLock}): callers arriving mid-refresh serve the current value at
 * once instead of queueing behind the network call, and a failed fetch is remembered for a short
 * {@linkplain #negativeCacheTtlMillis negative TTL} so a GitHub outage retries on a timer rather than
 * on every request. The JSON-to-{@link LatestRelease} mapping is the pure, static {@link
 * #parseLatestRelease(String)}, so it unit-tests entirely offline.
 */
@ApplicationScoped
public class GithubLatestReleaseApi {

    // GitHub's REST endpoint for the newest published, non-pre-release release. Its assets[] array
    // carries each real file's name, size and browser_download_url.
    static final String LATEST_RELEASE_API_URL =
            "https://api.github.com/repos/zelytra/BetterFleet/releases/latest";

    // GitHub rejects API requests that carry no User-Agent.
    private static final String USER_AGENT = "BetterFleet-backend";

    // The release JSON for a handful of assets is a few KB; cap the read so an unexpected or oversized
    // body can never be buffered without bound.
    private static final int MAX_RESPONSE_CHARS = 1_000_000;

    // Empty release: the shape every caller already treats as "nothing published yet".
    private static final LatestRelease EMPTY = new LatestRelease("", List.of());

    // How long an assembled release is served before it is rebuilt from api.github.com.
    @ConfigProperty(name = "github.release.cache-ttl-millis", defaultValue = "300000")
    long cacheTtlMillis;

    // How long a FAILED fetch is remembered before another is attempted. This bounds retries by time,
    // not by traffic: during an outage the slow fetch no longer re-runs on every incoming request.
    @ConfigProperty(name = "github.release.negative-cache-ttl-millis", defaultValue = "30000")
    long negativeCacheTtlMillis;

    @ConfigProperty(name = "github.release.connect-timeout-millis", defaultValue = "5000")
    int connectTimeoutMillis;

    @ConfigProperty(name = "github.release.read-timeout-millis", defaultValue = "5000")
    int readTimeoutMillis;

    // Optional GitHub token (GITHUB_API_TOKEN): absent or blank means anonymous, which works but
    // shares the 60 req/h per-IP quota; present raises it to 5000 req/h. Read-only public access is
    // all it needs - see application.properties.
    @ConfigProperty(name = "github.api.token")
    Optional<String> apiToken;

    // Clock seam so the cache TTL is unit-testable without sleeping: tests swap in a controllable
    // supplier, production reads the wall clock.
    LongSupplier clock = System::currentTimeMillis;

    // Only one thread refreshes at a time; others serve the current value rather than queueing behind
    // it. tryLock'd, deliberately not synchronized(this), which is what serialized every request onto
    // one slow fetch during a GitHub outage.
    private final ReentrantLock refreshLock = new ReentrantLock();

    private volatile LatestRelease cached;
    private volatile long cachedAtMillis;
    // Whether the last stamp recorded a failure (negative TTL applies) rather than a success (full TTL).
    private volatile boolean cachedIsError;

    /**
     * The latest release, from cache when fresh, otherwise reassembled from api.github.com. On any
     * failure it serves the last good value if there is one, else an empty release, so the endpoint
     * degrades to "nothing published yet" rather than erroring the download page. A refresh already
     * in flight is never joined: the caller serves the current value immediately.
     */
    public LatestRelease getLatestRelease() {
        if (isFresh()) {
            return current();
        }
        // Stale or cold. Exactly one thread refreshes; anyone arriving while that refresh is in flight
        // serves the current value at once rather than piling up behind the network call.
        if (!refreshLock.tryLock()) {
            return current();
        }
        try {
            // Another thread may have refreshed between our isFresh() check and acquiring the lock.
            if (isFresh()) {
                return current();
            }
            try {
                LatestRelease fresh = buildLatestRelease();
                cached = fresh;
                stamp(false);
                return fresh;
            } catch (Exception e) {
                Log.error("[GITHUB] Failed to assemble the latest release", e);
                // Remember the failure so requests within the negative TTL serve the last good value
                // (or EMPTY) without re-hitting a down GitHub.
                stamp(true);
                return current();
            }
        } finally {
            refreshLock.unlock();
        }
    }

    private LatestRelease current() {
        return cached != null ? cached : EMPTY;
    }

    private void stamp(boolean error) {
        cachedAtMillis = clock.getAsLong();
        cachedIsError = error;
    }

    /**
     * Fresh while within the applicable TTL: the full cache TTL after a success, the shorter negative
     * TTL after a failure. A cache that has never been stamped (cold, no failure yet recorded) is
     * never fresh.
     */
    private boolean isFresh() {
        if (cached == null && !cachedIsError) {
            return false; // never fetched
        }
        long ttl = cachedIsError ? negativeCacheTtlMillis : cacheTtlMillis;
        return (clock.getAsLong() - cachedAtMillis) < ttl;
    }

    /**
     * Fetches api.github.com's latest-release JSON and parses it into a {@link LatestRelease}.
     * Package-private so tests can stub it in place of the network call.
     */
    LatestRelease buildLatestRelease() throws IOException {
        return parseLatestRelease(httpGet(LATEST_RELEASE_API_URL));
    }

    /**
     * Turns GitHub's {@code releases/latest} JSON into a {@link LatestRelease}: the version from
     * {@code tag_name} (leading "v" stripped) and one {@link ReleaseAsset} per entry in {@code
     * assets[]} ({@code name}, {@code size}, {@code browser_download_url}). Pure and static, so the
     * whole mapping unit-tests offline against a captured payload.
     * <p>
     * Two guards return {@link #EMPTY}: a missing or blank {@code tag_name}, and a pre-release version
     * (one carrying a {@code -} suffix). {@code releases/latest} already resolves to the newest
     * non-pre-release, so the second is defense in depth, turning a cross-repo CI convention (a
     * released build is never an RC) into an enforced, testable backend rule. An asset missing its
     * name or URL is skipped rather than emitted as a dead download.
     */
    static LatestRelease parseLatestRelease(String json) {
        JsonObject root = JsonParser.parseString(json).getAsJsonObject();

        String version = stripLeadingV(optString(root, "tag_name"));
        if (version.isBlank()) {
            return EMPTY;
        }
        if (version.contains("-")) {
            Log.warn("[GITHUB] Latest release resolved to a pre-release (" + version + "), serving nothing");
            return EMPTY;
        }

        List<ReleaseAsset> assets = new ArrayList<>();
        JsonElement rawAssets = root.get("assets");
        if (rawAssets != null && rawAssets.isJsonArray()) {
            for (JsonElement element : rawAssets.getAsJsonArray()) {
                if (!element.isJsonObject()) {
                    continue;
                }
                JsonObject asset = element.getAsJsonObject();
                String name = optString(asset, "name");
                String url = optString(asset, "browser_download_url");
                long size = optLong(asset, "size");
                // A real GitHub asset always carries both; skip anything malformed rather than emit a
                // tile that links nowhere.
                if (!name.isBlank() && !url.isBlank()) {
                    assets.add(new ReleaseAsset(name, size, url));
                }
            }
        }
        return new LatestRelease(version, assets);
    }

    private static String stripLeadingV(String version) {
        if (!version.isEmpty() && (version.charAt(0) == 'v' || version.charAt(0) == 'V')) {
            return version.substring(1);
        }
        return version;
    }

    private static String optString(JsonObject object, String field) {
        JsonElement element = object.get(field);
        return element != null && element.isJsonPrimitive() ? element.getAsString() : "";
    }

    private static long optLong(JsonObject object, String field) {
        JsonElement element = object.get(field);
        return element != null && element.isJsonPrimitive() ? element.getAsLong() : 0L;
    }

    /**
     * Minimal GET returning the response body as text, bounded at {@link #MAX_RESPONSE_CHARS}. Sends
     * the User-Agent GitHub requires and the configured connect/read timeouts, so a slow api.github.com
     * cannot hang a request thread indefinitely.
     */
    private String httpGet(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", USER_AGENT);
            connection.setRequestProperty("Accept", "application/vnd.github+json");
            apiToken.filter(token -> !token.isBlank()).ifPresent(
                    token -> connection.setRequestProperty("Authorization", "Bearer " + token));
            connection.setConnectTimeout(connectTimeoutMillis);
            connection.setReadTimeout(readTimeoutMillis);
            try (Reader in = new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8)) {
                StringBuilder content = new StringBuilder();
                char[] buffer = new char[8192];
                int read;
                while ((read = in.read(buffer)) != -1) {
                    content.append(buffer, 0, read);
                    if (content.length() > MAX_RESPONSE_CHARS) {
                        throw new IOException("Release payload exceeded " + MAX_RESPONSE_CHARS
                                + " chars, refusing to buffer it");
                    }
                }
                return content.toString();
            }
        } finally {
            connection.disconnect();
        }
    }
}
