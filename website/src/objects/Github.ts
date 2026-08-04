export interface GithubRelease {
  version: string;
  publicationDate: Date;
  url: string;
}

export interface GithubReleaseAsset {
  name: string;
  url: string;
  /** File size in bytes; `0` when the API didn't report one. */
  size: number;
}

export interface GithubLatestRelease {
  /** The release tag, leading "v" stripped (e.g. "2.4.1"); "" when unknown. */
  version: string;
  assets: GithubReleaseAsset[];
}

const OWNER = "zelytra";
const REPO = "BetterFleet";

/** The latest release, browsable by a human — the resilient fallback when no asset matches yet. */
export const GITHUB_RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

/**
 * The latest GitHub release — its version and every attached asset (name, download URL, size) —
 * read straight from GitHub's public REST API.
 *
 * The Windows installer already has a stable resolver: the backend's `github/release/download`
 * proxy reads the Tauri updater manifest (`AppStore.githubRelease`). That proxy is Windows-shaped
 * today (#730) and extending it is out of scope here, so the download screen reads the whole asset
 * list — Windows and Linux alike, with their sizes — directly from GitHub instead. No backend
 * change needed, and a new package (`.rpm`, Flatpak, …) starts appearing the moment a release
 * carries it, with nothing left to wire up on this side.
 *
 * Resolves to an empty release on any failure — rate limit, offline, no release yet — rather than
 * throwing, so every caller's "nothing found" branch doubles as the "not published yet" branch.
 */
export async function fetchLatestRelease(): Promise<GithubLatestRelease> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return { version: "", assets: [] };
    const payload = await response.json();
    const version = String(payload?.tag_name ?? "").replace(/^v/i, "");
    const rawAssets = Array.isArray(payload?.assets) ? payload.assets : [];
    const assets: GithubReleaseAsset[] = rawAssets
      .map((asset: Record<string, unknown>) => ({
        name: String(asset?.name ?? ""),
        url: String(asset?.browser_download_url ?? ""),
        size: Number(asset?.size ?? 0),
      }))
      .filter((asset: GithubReleaseAsset) => asset.name && asset.url);
    return { version, assets };
  } catch {
    return { version: "", assets: [] };
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
