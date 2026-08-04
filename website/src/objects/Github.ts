export interface GithubRelease {
  version: string;
  publicationDate: Date;
  url: string;
}

export interface GithubReleaseAsset {
  name: string;
  url: string;
}

const OWNER = "zelytra";
const REPO = "BetterFleet";

/** The latest release, browsable by a human — the resilient fallback when no asset matches yet. */
export const GITHUB_RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

/**
 * Assets attached to the latest GitHub release, read straight from GitHub's public REST API.
 *
 * The Windows installer already has a stable resolver: the backend's `github/release/download`
 * proxy reads the Tauri updater manifest (`AppStore.githubRelease`). That proxy is Windows-shaped
 * today (#730) and extending it is out of scope here, so the Linux `.deb`/AppImage is resolved
 * directly from GitHub instead — no backend change needed, and it starts working the moment the
 * CI/CD issue (#728) publishes those assets, with nothing left to wire up on this side.
 *
 * Resolves to `[]` on any failure — rate limit, offline, no release yet — rather than throwing, so
 * every caller's "nothing found" branch doubles as the "not published yet" branch.
 */
export async function fetchLatestReleaseAssets(): Promise<
  GithubReleaseAsset[]
> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return [];
    const payload = await response.json();
    const assets = Array.isArray(payload?.assets) ? payload.assets : [];
    return assets
      .map((asset: Record<string, unknown>) => ({
        name: String(asset?.name ?? ""),
        url: String(asset?.browser_download_url ?? ""),
      }))
      .filter((asset: GithubReleaseAsset) => asset.name && asset.url);
  } catch {
    return [];
  }
}

/** First asset whose file name ends with one of the given extensions (case-insensitive). */
export function findReleaseAsset(
  assets: GithubReleaseAsset[],
  extensions: string[],
): GithubReleaseAsset | undefined {
  return assets.find((asset) => {
    const name = asset.name.toLowerCase();
    return extensions.some((ext) => name.endsWith(ext.toLowerCase()));
  });
}
