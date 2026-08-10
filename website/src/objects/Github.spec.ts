import { afterEach, describe, expect, it, vi } from "vitest";
import {
  constructedRelease,
  fetchLatestRelease,
  findReleaseAsset,
  type GithubReleaseAsset,
} from "@/objects/Github.ts";

// The asset names the real v2.3.0-rc.3 release ships. The installer sits right next to its signature
// and NSIS-updater siblings (.exe.sig, .nsis.zip, .nsis.zip.sig), so an extension match that isn't
// anchored to the end of the name would happily pick the wrong file.
const REAL_ASSET_NAMES = [
  "BetterFleet-2.3.0-rc.3-1.x86_64.rpm",
  "betterfleet-bin-2.3.0.rc.3-1-x86_64.pkg.tar.zst",
  "BetterFleet_2.3.0-rc.3_amd64.deb",
  "BetterFleet_2.3.0-rc.3_x64-setup.exe",
  "BetterFleet_2.3.0-rc.3_x64-setup.exe.sig",
  "BetterFleet_2.3.0-rc.3_x64-setup.nsis.zip",
  "BetterFleet_2.3.0-rc.3_x64-setup.nsis.zip.sig",
  "latest.json",
];

const realAssets: GithubReleaseAsset[] = REAL_ASSET_NAMES.map((name) => ({
  name,
  url: `https://example.com/${name}`,
  size: 1024,
}));

describe("findReleaseAsset", () => {
  it("matches the Windows installer without catching its .sig / .nsis.zip siblings", () => {
    const asset = findReleaseAsset(realAssets, [".exe"]);
    expect(asset?.name).toBe("BetterFleet_2.3.0-rc.3_x64-setup.exe");
  });

  it("matches the Arch package on the full .pkg.tar.zst suffix", () => {
    const asset = findReleaseAsset(realAssets, [".pkg.tar.zst"]);
    expect(asset?.name).toBe("betterfleet-bin-2.3.0.rc.3-1-x86_64.pkg.tar.zst");
  });

  it("resolves the .deb and .rpm packages", () => {
    expect(findReleaseAsset(realAssets, [".deb"])?.name).toBe(
      "BetterFleet_2.3.0-rc.3_amd64.deb",
    );
    expect(findReleaseAsset(realAssets, [".rpm"])?.name).toBe(
      "BetterFleet-2.3.0-rc.3-1.x86_64.rpm",
    );
  });

  it("returns undefined for a format the release doesn't carry", () => {
    expect(findReleaseAsset(realAssets, [".flatpak"])).toBeUndefined();
  });

  it("matches case-insensitively", () => {
    expect(findReleaseAsset(realAssets, [".EXE"])?.name).toBe(
      "BetterFleet_2.3.0-rc.3_x64-setup.exe",
    );
  });
});

/** A minimal `fetch` Response stand-in - only the members the release code reads. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

/** The proxy payload shape: assets carry `url` and the manifest carries `version`. */
function proxyPayload(names: string[] = REAL_ASSET_NAMES) {
  return {
    version: "v2.3.0-rc.3",
    assets: names.map((name) => ({
      name,
      url: `https://proxy.example/${name}`,
      size: 10,
    })),
  };
}

/**
 * GitHub's own shape, faithfully: every real asset carries BOTH `url` (the api.github.com JSON
 * endpoint describing the asset) and `browser_download_url` (the actual file). An earlier version of
 * this helper omitted `url`, which is exactly how a preference-order bug in the sanitizer slipped
 * through: tests resolved the only URL present while production resolved the API one, and every
 * download tile opened a JSON page instead of the file.
 */
function githubPayload(names: string[] = REAL_ASSET_NAMES) {
  return {
    tag_name: "v2.3.0-rc.3",
    assets: names.map((name, index) => ({
      name,
      url: `https://api.github.example/repos/zelytra/BetterFleet/releases/assets/${index}`,
      browser_download_url: `https://github.example/${name}`,
      size: 20,
    })),
  };
}

/** Routes the stubbed fetch by URL: `api.github.com` is the fallback, everything else the proxy. */
function mockFetch(handlers: {
  proxy?: () => Response;
  github?: () => Response;
}) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown) => {
      const isGithub = String(url).includes("api.github.com");
      const handler = isGithub ? handlers.github : handlers.proxy;
      // A handler that throws models a rejected fetch (network down); its absence means the test did
      // not expect this source to be called at all.
      return Promise.resolve().then(() => {
        if (!handler) throw new Error(`unexpected fetch: ${String(url)}`);
        return handler();
      });
    }),
  );
}

describe("fetchLatestRelease", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("uses the proxy when it answers with resolvable assets", async () => {
    mockFetch({ proxy: () => jsonResponse(proxyPayload()) });
    const release = await fetchLatestRelease();
    expect(release).not.toBeNull();
    expect(release!.version).toBe("2.3.0-rc.3");
    expect(findReleaseAsset(release!.assets, [".exe"])?.url).toContain("proxy");
  });

  it("falls back to GitHub when the proxy answers a non-OK status", async () => {
    mockFetch({
      proxy: () => jsonResponse({}, false, 500),
      github: () => jsonResponse(githubPayload()),
    });
    const release = await fetchLatestRelease();
    expect(findReleaseAsset(release!.assets, [".exe"])?.url).toBe(
      "https://github.example/BetterFleet_2.3.0-rc.3_x64-setup.exe",
    );
  });

  it("resolves GitHub assets to browser_download_url, never the API url", async () => {
    // The regression this file exists for: with both fields present (as on the real API), the
    // download link must be the file, not the api.github.com JSON page describing it.
    mockFetch({
      proxy: () => jsonResponse({}, false, 500),
      github: () => jsonResponse(githubPayload()),
    });
    const release = await fetchLatestRelease();
    for (const asset of release!.assets) {
      expect(asset.url).not.toContain("api.github.example");
    }
  });

  it("falls back to GitHub when the proxy fetch throws", async () => {
    mockFetch({
      proxy: () => {
        throw new Error("network down");
      },
      github: () => jsonResponse(githubPayload()),
    });
    const release = await fetchLatestRelease();
    expect(release).not.toBeNull();
    expect(findReleaseAsset(release!.assets, [".deb"])?.url).toBe(
      "https://github.example/BetterFleet_2.3.0-rc.3_amd64.deb",
    );
  });

  it("falls back to GitHub when the proxy is reachable but empty", async () => {
    mockFetch({
      proxy: () => jsonResponse({ version: "v2.3.0-rc.3", assets: [] }),
      github: () => jsonResponse(githubPayload()),
    });
    const release = await fetchLatestRelease();
    expect(release!.assets.length).toBeGreaterThan(0);
    expect(findReleaseAsset(release!.assets, [".exe"])?.url).toContain(
      "github",
    );
  });

  it("falls back to GitHub when the proxy set lacks the Windows installer", async () => {
    // A partial proxy answer (Linux packages only, no .exe) is treated as broken; GitHub has the set.
    const linuxOnly = REAL_ASSET_NAMES.filter((n) => !n.endsWith(".exe"));
    mockFetch({
      proxy: () => jsonResponse(proxyPayload(linuxOnly)),
      github: () => jsonResponse(githubPayload()),
    });
    const release = await fetchLatestRelease();
    expect(findReleaseAsset(release!.assets, [".exe"])?.url).toContain(
      "github",
    );
  });

  it("serves the constructed catalog when neither source can be reached", async () => {
    // The rate-limit scenario this file exists for: backend down AND api.github.com answering 403.
    // The page must still hand out downloads, built from the site's own release version - never a
    // "coming soon" for an installer that exists, never a dependency on the GitHub API. The version
    // is stubbed because $npm_package_version only expands under npm scripts, not bare vitest.
    vi.stubEnv("VITE_VERSION", "2.3.0");
    mockFetch({
      proxy: () => {
        throw new Error("proxy down");
      },
      github: () => jsonResponse({}, false, 403),
    });
    const release = await fetchLatestRelease();
    expect(release).not.toBeNull();
    expect(release!.version).toBe("2.3.0");
    expect(findReleaseAsset(release!.assets, [".exe"])?.url).toBe(
      "https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/BetterFleet_2.3.0_x64-setup.exe",
    );
  });

  it("prefers the constructed catalog over a reached-but-empty source", async () => {
    // An empty enumeration while our own build version names a real release is a degraded source
    // (rate-limited proxy serving its EMPTY fallback), not "nothing published yet": the offline
    // catalog wins so the tiles never regress to "coming soon".
    vi.stubEnv("VITE_VERSION", "2.4.0");
    mockFetch({
      proxy: () => jsonResponse({ version: "v2.4.0", assets: [] }),
      github: () => jsonResponse({ tag_name: "v2.4.0", assets: [] }),
    });
    const release = await fetchLatestRelease();
    expect(release).not.toBeNull();
    expect(release!.assets.length).toBeGreaterThan(0);
    expect(findReleaseAsset(release!.assets, [".exe"])).toBeDefined();
  });

  it("signals failure with null only when even the build version is absent", async () => {
    vi.stubEnv("VITE_VERSION", "");
    mockFetch({
      proxy: () => {
        throw new Error("proxy down");
      },
      github: () => jsonResponse({}, false, 503),
    });
    expect(await fetchLatestRelease()).toBeNull();
  });
});

describe("constructedRelease", () => {
  it("builds all four packages for a stable release from 2.3.0 on", () => {
    const release = constructedRelease("2.3.0");
    expect(release!.version).toBe("2.3.0");
    expect(release!.assets.map((a) => a.name)).toEqual([
      "BetterFleet_2.3.0_x64-setup.exe",
      "BetterFleet_2.3.0_amd64.deb",
      "BetterFleet-2.3.0-1.x86_64.rpm",
      "betterfleet-bin-2.3.0-1-x86_64.pkg.tar.zst",
    ]);
    for (const asset of release!.assets) {
      expect(asset.url).toBe(
        `https://github.com/zelytra/BetterFleet/releases/download/v2.3.0/${asset.name}`,
      );
      expect(asset.size).toBe(0);
    }
  });

  it("matches the real rc.3 asset names, pacman dash-to-dot substitution included", () => {
    // Cross-checked against REAL_ASSET_NAMES above - the names v2.3.0-rc.3 actually shipped.
    const names = constructedRelease("2.3.0-rc.3")!.assets.map((a) => a.name);
    expect(names).toContain("BetterFleet_2.3.0-rc.3_x64-setup.exe");
    expect(names).toContain("BetterFleet_2.3.0-rc.3_amd64.deb");
    expect(names).toContain("BetterFleet-2.3.0-rc.3-1.x86_64.rpm");
    expect(names).toContain("betterfleet-bin-2.3.0.rc.3-1-x86_64.pkg.tar.zst");
    for (const name of names) {
      expect(REAL_ASSET_NAMES).toContain(name);
    }
  });

  it("builds only the Windows installer for releases before 2.3.0", () => {
    // Linux packages first shipped with 2.3.0; constructing them for 2.2.2 would link to a 404.
    const release = constructedRelease("2.2.2");
    expect(release!.assets.map((a) => a.name)).toEqual([
      "BetterFleet_2.2.2_x64-setup.exe",
    ]);
  });

  it("returns null without a version", () => {
    expect(constructedRelease("")).toBeNull();
  });
});
