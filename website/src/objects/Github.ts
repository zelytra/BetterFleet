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
 * When neither live source can enumerate the assets, the page must still hand out downloads: the
 * site knows which release it shipped with (`VITE_VERSION`, stamped at build time by the release
 * pipeline that publishes the site and the installers together), and release-asset names are
 * deterministic, so {@link constructedRelease} rebuilds the catalog offline. Its links go through
 * GitHub's release-download CDN, which is NOT governed by the api.github.com rate limit - the
 * anonymous 60 req/h quota (shared across a NAT) whose 403 used to leave the Windows tile on
 * "coming soon" while the installer was perfectly reachable. No size labels on that path, but every
 * download works. The page therefore never depends on the GitHub API being available.
 *
 * `null` - the caller's error panel - is only reached when even the build-time version is somehow
 * absent AND both live sources failed: effectively never in a real build.
 */
export async function fetchLatestRelease(): Promise<GithubLatestRelease | null> {
  const fromProxy = await fetchLatestReleaseFromProxy();
  if (hasResolvableAssets(fromProxy)) return fromProxy;

  const fromGithub = await fetchLatestReleaseFromGithub();
  if (hasResolvableAssets(fromGithub)) return fromGithub;

  // Neither live source enumerated the downloads (backend down or empty, GitHub API rate-limited
  // or unreachable). Serve the offline catalog built from the site's own release version instead:
  // deterministic asset names on the release CDN, immune to the API rate limit.
  const constructed = constructedRelease();
  if (constructed) return constructed;

  // No build-time version either. Prefer whichever live source actually answered so a genuinely
  // asset-less release still reads as "reached" rather than a failure; null from both means
  // nothing answered -> the caller's error state.
  return fromProxy ?? fromGithub;
}

/**
 * The release catalog rebuilt offline from the site's own build-time version, or `null` when no
 * version was stamped. Every release publishes the site image and the installers from one pipeline,
 * so `VITE_VERSION` names a release whose assets exist, and Tauri/CI asset names are deterministic:
 *
 * - `BetterFleet_<v>_x64-setup.exe` - Windows, every release ever
 * - `BetterFleet_<v>_amd64.deb`, `BetterFleet-<v>-1.x86_64.rpm`,
 *   `betterfleet-bin-<v'>-1-x86_64.pkg.tar.zst` - Linux, from 2.3.0 on (the first release that
 *   ships them; constructing them for an older version would link to a 404)
 *
 * where `<v'>` is the version with `-` mapped to `.` (pacman's pkgver forbids hyphens - the same
 * substitution `publish-arch` applies). Sizes are unknown offline and left at 0; the tiles simply
 * omit the size label. Exported for tests, which pin these exact shapes against real release
 * asset names.
 */
export function constructedRelease(
  version = String(import.meta.env.VITE_VERSION ?? "").replace(/^v/i, ""),
): GithubLatestRelease | null {
  if (!version) return null;
  const download = (name: string) =>
    `https://github.com/${OWNER}/${REPO}/releases/download/v${version}/${name}`;
  const asset = (name: string): GithubReleaseAsset => ({
    name,
    url: download(name),
    size: 0,
  });

  const assets: GithubReleaseAsset[] = [
    asset(`BetterFleet_${version}_x64-setup.exe`),
  ];
  if (hasLinuxPackages(version)) {
    const pacmanVersion = version.replace(/-/g, ".");
    assets.push(
      asset(`BetterFleet_${version}_amd64.deb`),
      asset(`BetterFleet-${version}-1.x86_64.rpm`),
      asset(`betterfleet-bin-${pacmanVersion}-1-x86_64.pkg.tar.zst`),
    );
  }
  return { version, assets };
}

/** Whether a release version ships the Linux packages: 2.3.0 is the first that does. */
function hasLinuxPackages(version: string): boolean {
  const [major = 0, minor = 0] = version
    .split(".")
    .map((part) => parseInt(part, 10) || 0);
  return major > 2 || (major === 2 && minor >= 3);
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
      // browser_download_url FIRST: GitHub's payload carries both, and its `url` is the
      // api.github.com JSON endpoint describing the asset, not the file - preferring it sent
      // every download click to a JSON page whenever the GitHub fallback engaged. The proxy's
      // payload has only `url`, which is already the direct download.
      url: String(asset?.browser_download_url ?? asset?.url ?? ""),
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
