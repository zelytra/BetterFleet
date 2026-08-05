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

/** The latest release, browsable by a human - the resilient fallback when no asset matches yet. */
export const GITHUB_RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

/**
 * The latest release - its version and every attached asset (name, download URL, size) - read from
 * the backend's `github/release/latest` proxy.
 *
 * The proxy reads GitHub server-side and caches the result, so the whole download page draws on one
 * shared, cached call instead of every visitor spending their own anonymous GitHub quota (60 req/h
 * per IP, shared behind a NAT) - the rate limit that used to leave asset tiles stuck on "coming
 * soon" even when the file existed. The shape is GitHub's own: version (leading "v" stripped) plus
 * each asset's name, direct download URL and size, Windows and Linux alike, so a new package
 * (`.rpm`, Flatpak, …) still appears the moment a release carries it.
 *
 * If the proxy is unreachable - offline backend, network error, non-OK status - it falls back to
 * reading GitHub's public REST API straight from the browser, the original path, so the page keeps
 * working (just without the shared cache). Either source resolves to an empty release on any failure
 * rather than throwing, so every caller's "nothing found" branch doubles as the "not published yet"
 * branch.
 */
export async function fetchLatestRelease(): Promise<GithubLatestRelease> {
  const fromProxy = await fetchLatestReleaseFromProxy();
  if (fromProxy) return fromProxy;
  return fetchLatestReleaseFromGithub();
}

/**
 * The latest release from the backend proxy, or `null` - not an empty release - when the proxy can't
 * be reached or answers with an error. That `null` is the signal for {@link fetchLatestRelease} to
 * fall back to GitHub; a reachable proxy is authoritative, so its (possibly empty) release is used
 * as-is and a crowd never spills back onto per-visitor GitHub calls in the normal case.
 */
async function fetchLatestReleaseFromProxy(): Promise<GithubLatestRelease | null> {
  try {
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_HOST}/github/release/latest`,
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return sanitizeRelease(payload?.version, payload?.assets);
  } catch {
    return null;
  }
}

/** The fallback path: the latest release read straight from GitHub's public REST API. */
async function fetchLatestReleaseFromGithub(): Promise<GithubLatestRelease> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
      { headers: { Accept: "application/vnd.github+json" } },
    );
    if (!response.ok) return { version: "", assets: [] };
    const payload = await response.json();
    return sanitizeRelease(payload?.tag_name, payload?.assets);
  } catch {
    return { version: "", assets: [] };
  }
}

/**
 * Normalizes a release payload from either source into {@link GithubLatestRelease}: the leading "v"
 * is stripped from the version, and each asset keeps its name, direct download URL (`url` from the
 * proxy, `browser_download_url` from GitHub) and byte size. Assets missing a name or URL are dropped.
 */
function sanitizeRelease(
  version: unknown,
  rawAssets: unknown,
): GithubLatestRelease {
  const assets: GithubReleaseAsset[] = (
    Array.isArray(rawAssets) ? rawAssets : []
  )
    .map((asset: Record<string, unknown>) => ({
      name: String(asset?.name ?? ""),
      url: String(asset?.url ?? asset?.browser_download_url ?? ""),
      size: Number(asset?.size ?? 0),
    }))
    .filter((asset: GithubReleaseAsset) => asset.name && asset.url);
  return { version: String(version ?? "").replace(/^v/i, ""), assets };
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
