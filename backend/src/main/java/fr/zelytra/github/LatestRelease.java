package fr.zelytra.github;

import java.util.List;

/**
 * The latest GitHub release as the download page needs it: the version (release tag, leading "v"
 * stripped) and every attached {@link ReleaseAsset}. Serialized to
 * {@code {"version": ..., "assets": [{"name", "size", "url"}]}} by {@code GET /github/release/latest}.
 */
public record LatestRelease(String version, List<ReleaseAsset> assets) {
}
