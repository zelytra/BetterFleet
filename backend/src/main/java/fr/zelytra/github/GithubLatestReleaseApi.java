package fr.zelytra.github;

import io.quarkus.logging.Log;
import jakarta.enterprise.context.ApplicationScoped;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * Server-side proxy for the repository's latest release, exposing the version and every available
 * asset (name, size, direct download URL) via {@link #getLatestRelease()} — feeding the website's
 * download page so it no longer reads GitHub from each visitor's browser (which spent that visitor's
 * anonymous api.github.com quota and left asset tiles stuck on "Bientôt" once the limit was hit).
 * <p>
 * It never touches api.github.com and needs no token. The version comes from the static Tauri updater
 * manifest — the very source, and parser, the {@code /release/download} proxy already uses
 * ({@link GithubApi#RELEASE_URL}, {@link GithubApi#parseGithubRelease(String)}). From that version the
 * assets' file names are fully determined (Tauri v2's bundle names are deterministic), so each URL is
 * built by hand and probed with a plain HEAD: present (HTTP 200) → included with its {@code
 * Content-Length}; missing (404) → omitted, and the page renders "Bientôt" for it, so there is never
 * a dead link. Release-asset downloads carry no API rate limit, so this stays token-free.
 * <p>
 * The assembled result is {@linkplain #CACHE_TTL_MILLIS cached} for a few minutes, so many visitors
 * collapse into roughly one refresh per window. Building is lazy (first request, then on cache
 * expiry) rather than at startup, so the bean never couples boot to network availability. The
 * assembly is a pure, static {@link #assembleRelease(String, Function)} — the manifest and HEAD
 * calls are seams it takes as inputs — so it unit-tests entirely offline.
 */
@ApplicationScoped
public class GithubLatestReleaseApi {

    // A release's downloadable assets live under <BASE>v<version>/<file>.
    static final String ASSET_DOWNLOAD_BASE = "https://github.com/zelytra/BetterFleet/releases/download/";

    // Fixed asset file names, {v} standing in for the version — Tauri v2's deterministic bundle
    // names, so they need no lookup, only an existence probe:
    //   NSIS installer     BetterFleet_<v>_x64-setup.exe
    //   WiX / MSI installer BetterFleet_<v>_x64_en-US.msi  (Tauri's default en-US WiX language)
    //   Debian package     BetterFleet_<v>_amd64.deb
    //   AppImage           BetterFleet_<v>_amd64.AppImage
    static final String VERSION_TOKEN = "{v}";
    static final List<String> ASSET_FILE_NAMES = List.of(
            "BetterFleet_{v}_x64-setup.exe",
            "BetterFleet_{v}_x64_en-US.msi",
            "BetterFleet_{v}_amd64.deb",
            "BetterFleet_{v}_amd64.AppImage");

    // How long an assembled release is served before it is rebuilt (manifest + HEAD probes).
    static final long CACHE_TTL_MILLIS = 5 * 60 * 1000L;

    // Empty release — the shape every caller already treats as "nothing published yet".
    private static final LatestRelease EMPTY = new LatestRelease("", List.of());

    private volatile LatestRelease cached;
    private volatile long cachedAtMillis;

    /**
     * The latest release, from cache when fresh, otherwise reassembled from the manifest version and
     * a HEAD probe of each asset URL. On any failure it serves the last good value if there is one,
     * else an empty release — so the endpoint degrades to "nothing published yet" rather than
     * erroring the download page.
     */
    public LatestRelease getLatestRelease() {
        if (isFresh()) {
            return cached;
        }
        synchronized (this) {
            // Another thread may have refreshed the cache while we waited on the lock.
            if (isFresh()) {
                return cached;
            }
            try {
                LatestRelease fresh = buildLatestRelease();
                cached = fresh;
                cachedAtMillis = System.currentTimeMillis();
                return fresh;
            } catch (Exception e) {
                Log.error("[GITHUB] Failed to assemble the latest release", e);
                return cached != null ? cached : EMPTY;
            }
        }
    }

    private boolean isFresh() {
        return cached != null && (System.currentTimeMillis() - cachedAtMillis) < CACHE_TTL_MILLIS;
    }

    /** Reads the manifest version, then probes each fixed asset URL for that version. */
    LatestRelease buildLatestRelease() throws IOException {
        return assembleRelease(fetchLatestVersion(), this::probeAssetSize);
    }

    /**
     * The latest version, read from the static Tauri updater manifest ({@link GithubApi#RELEASE_URL})
     * and parsed with {@link GithubApi#parseGithubRelease(String)} — the same source and parser the
     * {@code /release/download} proxy uses. No api.github.com, no token. Package-private so tests can
     * stub it in place of the network call.
     */
    String fetchLatestVersion() throws IOException {
        return GithubApi.parseGithubRelease(httpGet(GithubApi.RELEASE_URL)).getVersion();
    }

    /**
     * Builds the release from a version and a per-URL size probe. For each fixed asset file name it
     * constructs {@code <BASE>v<version>/<file>} and, when the probe reports a size (asset present),
     * includes it; a {@code null} size means the release doesn't carry that asset, so it is omitted.
     * Pure and static so it unit-tests offline — the probe stands in for the HEAD request, the version
     * for the manifest read.
     */
    static LatestRelease assembleRelease(String version, Function<String, Long> sizeProbe) {
        if (version == null || version.isBlank()) {
            return EMPTY;
        }
        String base = ASSET_DOWNLOAD_BASE + "v" + version + "/";
        List<ReleaseAsset> assets = new ArrayList<>();
        for (String template : ASSET_FILE_NAMES) {
            String name = template.replace(VERSION_TOKEN, version);
            String url = base + name;
            Long size = sizeProbe.apply(url);
            if (size != null) {
                assets.add(new ReleaseAsset(name, size, url));
            }
        }
        return new LatestRelease(version, assets);
    }

    /**
     * HEADs a release asset URL, following GitHub's redirect to the download CDN. Returns the asset
     * size ({@code Content-Length}, or {@code 0} when the server omits it) when the file is there
     * (HTTP 200), or {@code null} when it is missing (404) or the probe fails. Release-asset downloads
     * are not API-rate-limited, so no token is needed. Package-private so tests can stub it.
     */
    Long probeAssetSize(String assetUrl) {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(assetUrl).openConnection();
            connection.setRequestMethod("HEAD");
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "BetterFleet-backend");
            // Bound the probe so an unresponsive GitHub can't hang the request thread indefinitely.
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                return null;
            }
            long length = connection.getContentLengthLong();
            return length >= 0 ? length : 0L;
        } catch (Exception e) {
            Log.warn("[GITHUB] HEAD probe failed for " + assetUrl, e);
            return null;
        } finally {
            if (connection != null) {
                connection.disconnect();
            }
        }
    }

    /** Minimal GET returning the response body as text; used for the small, static updater manifest. */
    private static String httpGet(String url) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            connection.setRequestMethod("GET");
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("User-Agent", "BetterFleet-backend");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            try (BufferedReader in = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                StringBuilder content = new StringBuilder();
                String line;
                while ((line = in.readLine()) != null) {
                    content.append(line);
                }
                return content.toString();
            }
        } finally {
            connection.disconnect();
        }
    }
}
