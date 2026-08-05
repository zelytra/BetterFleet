package fr.zelytra.github;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure unit tests for the release assembly.
 * <p>
 * These deliberately avoid the live network path so the suite stays deterministic and offline-safe -
 * mirroring {@link GithubApiTest}. The two seams are mocked as inputs to the static
 * {@link GithubLatestReleaseApi#assembleRelease(String, java.util.function.Function)}: the version
 * stands in for the manifest read, and the size-probe function stands in for the per-asset HEAD, so
 * URL construction, the fixed Tauri file names, and the present/absent (HTTP 200 vs 404) inclusion
 * logic are all exercised without touching GitHub.
 */
class GithubLatestReleaseApiTest {

    private static final String VERSION = "2.4.1";
    private static final String BASE =
            "https://github.com/zelytra/BetterFleet/releases/download/v" + VERSION + "/";

    private static final String EXE = BASE + "BetterFleet_2.4.1_x64-setup.exe";
    private static final String MSI = BASE + "BetterFleet_2.4.1_x64_en-US.msi";
    private static final String DEB = BASE + "BetterFleet_2.4.1_amd64.deb";
    private static final String APPIMAGE = BASE + "BetterFleet_2.4.1_amd64.AppImage";

    @Test
    void assembleRelease_probesEveryTauriAssetUrlUnderTheVersionedReleasePath() {
        List<String> probed = new ArrayList<>();

        // Every asset "missing" (probe returns null): assembly still constructs and probes each URL.
        LatestRelease release = GithubLatestReleaseApi.assembleRelease(VERSION, url -> {
            probed.add(url);
            return null;
        });

        // The exact URLs - and therefore the exact Tauri v2 bundle file names - in a fixed order.
        assertEquals(List.of(EXE, MSI, DEB, APPIMAGE), probed);
        assertEquals(VERSION, release.version());
        assertTrue(release.assets().isEmpty(), "Nothing present → no assets");
    }

    @Test
    void assembleRelease_includesEveryPresentAssetWithItsProbedSize() {
        Map<String, Long> sizes = Map.of(
                EXE, 9_400_000L,
                MSI, 10_000_000L,
                DEB, 7_800_000L,
                APPIMAGE, 92_000_000L);

        LatestRelease release = GithubLatestReleaseApi.assembleRelease(VERSION, sizes::get);

        assertEquals(4, release.assets().size());

        ReleaseAsset exe = release.assets().get(0);
        assertEquals("BetterFleet_2.4.1_x64-setup.exe", exe.name());
        assertEquals(EXE, exe.url());
        assertEquals(9_400_000L, exe.size());

        ReleaseAsset msi = release.assets().get(1);
        assertEquals("BetterFleet_2.4.1_x64_en-US.msi", msi.name());
        assertEquals(MSI, msi.url());
        assertEquals(10_000_000L, msi.size());

        ReleaseAsset deb = release.assets().get(2);
        assertEquals("BetterFleet_2.4.1_amd64.deb", deb.name());
        assertEquals(DEB, deb.url());
        assertEquals(7_800_000L, deb.size());

        ReleaseAsset appimage = release.assets().get(3);
        assertEquals("BetterFleet_2.4.1_amd64.AppImage", appimage.name());
        assertEquals(APPIMAGE, appimage.url());
        assertEquals(92_000_000L, appimage.size());
    }

    @Test
    void assembleRelease_omitsAssetsTheProbeReportsMissing() {
        // Only the Windows .exe and the Linux .deb are published; the .msi and .AppImage 404.
        Map<String, Long> sizes = Map.of(EXE, 9_400_000L, DEB, 7_800_000L);

        LatestRelease release = GithubLatestReleaseApi.assembleRelease(VERSION, sizes::get);

        List<String> names = release.assets().stream().map(ReleaseAsset::name).toList();
        assertEquals(
                List.of("BetterFleet_2.4.1_x64-setup.exe", "BetterFleet_2.4.1_amd64.deb"), names);
    }

    @Test
    void assembleRelease_keepsAPresentAssetEvenWhenItsSizeIsUnknown() {
        // A 200 with no Content-Length surfaces as size 0 (non-null) - still a real, downloadable
        // asset, so it must be kept rather than mistaken for missing.
        LatestRelease release =
                GithubLatestReleaseApi.assembleRelease(VERSION, url -> url.equals(EXE) ? 0L : null);

        assertEquals(1, release.assets().size());
        assertEquals("BetterFleet_2.4.1_x64-setup.exe", release.assets().get(0).name());
        assertEquals(0L, release.assets().get(0).size());
    }

    @Test
    void assembleRelease_returnsAnEmptyReleaseForABlankVersion() {
        for (String blank : new String[] {"", "   ", null}) {
            LatestRelease release = GithubLatestReleaseApi.assembleRelease(blank, url -> 1L);
            assertEquals("", release.version());
            assertEquals(List.of(), release.assets());
        }
    }
}
