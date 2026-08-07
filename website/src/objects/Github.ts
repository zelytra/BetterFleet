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

/**
 * How long either release fetch may hang before it's aborted and treated as a failure. Without it a
 * stalled connection (dead proxy that accepts but never answers, a captive portal) would leave the
 * download page spinning forever; 8s matches the desktop client's own release call.
 */
const REQUEST_TIMEOUT_MS = 8000;

/** The latest release, browsable by a human - the resilient fallback when no asset matches yet. */
export const GITHUB_RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases/latest`;

/**
 * The latest release - its version and every attached asset (name, download URL, size) - read from
 * the backend's `github/release/latest` proxy, or `null` when no source could be reached at all.
 *
 * The proxy reads GitHub server-side and caches the result, so the whole download page draws on one
 * shared, cached call instead of every visitor spending their own anonymous GitHub quota (60 req/h
 * per IP, shared behind a NAT) - the rate limit that used to leave asset tiles stuck on "coming
 * soon" even when the file existed. The shape is GitHub's own: version (leading "v" stripped) plus
 * each asset's name, direct download URL and size, Windows and Linux alike, so a new package
 * (`.rpm`, …) still appears the moment a release carries it.
 *
 * The proxy is used only when it actually enumerates the downloads ({@link hasResolvableAssets}). A
 * reachable-but-empty proxy - or one answering `200` with a partial set that lacks the Windows
 * installer - is not trusted: the call falls back to reading GitHub's public REST API straight from
 * the browser, the original path, so a broken proxy can't strand the page on "coming soon" while
 * GitHub has the files.
 *
 * Failure is signalled distinctly from emptiness. When neither source can be reached - offline
 * backend and no GitHub either, network error, or the 8s timeout - this returns `null` so the caller
 * shows a real error ("couldn't reach the release server") instead of a page of "coming soon" that
 * would tell a visitor the software doesn't exist. A source that *is* reached but genuinely carries
 * no assets resolves to an empty release, not `null`, so "not published yet" stays the "coming soon"
 * branch.
 */
export async function fetchLatestRelease(): Promise<GithubLatestRelease | null> {
  const fromProxy = await fetchLatestReleaseFromProxy();
  if (hasResolvableAssets(fromProxy)) return fromProxy;

  const fromGithub = await fetchLatestReleaseFromGithub();
  if (hasResolvableAssets(fromGithub)) return fromGithub;

  // Neither source carried resolvable downloads. Prefer whichever one actually answered so a
  // genuinely asset-less release still reads as "reached" (an empty release -> "coming soon")
  // rather than a failure; `null` from both means nothing answered -> the caller's error state.
  return fromProxy ?? fromGithub;
}

/**
 * Whether a release actually carries downloads we can hand out: a non-empty asset list that includes
 * the Windows installer, the one asset every release ships. A reachable-but-empty proxy, or one that
 * answers with a partial set missing the `.exe`, fails this so {@link fetchLatestRelease} falls
 * through to GitHub instead of trusting it - defence in depth against a proxy that returns `200`
 * without enumerating the real assets.
 */
function hasResolvableAssets(
  release: GithubLatestRelease | null,
): release is GithubLatestRelease {
  return (
    release !== null &&
    release.assets.length > 0 &&
    findReleaseAsset(release.assets, [".exe"]) !== undefined
  );
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
      { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return sanitizeRelease(payload?.version, payload?.assets);
  } catch {
    return null;
  }
}

/**
 * The fallback path: the latest release read straight from GitHub's public REST API. Returns `null`
 * - not an empty release - when GitHub can't be reached (network error, non-OK status, or the
 * timeout firing), so {@link fetchLatestRelease} can tell a genuine failure from an empty release.
 */
async function fetchLatestReleaseFromGithub(): Promise<GithubLatestRelease | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${OWNER}/${REPO}/releases/latest`,
      {
        headers: { Accept: "application/vnd.github+json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const payload = await response.json();
    return sanitizeRelease(payload?.tag_name, payload?.assets);
  } catch {
    return null;
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
