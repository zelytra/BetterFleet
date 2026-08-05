package fr.zelytra.github;

/**
 * One downloadable file attached to a GitHub release: its file name, size in bytes and the direct
 * {@code browser_download_url}. Platform-agnostic on purpose — a Windows {@code .exe}/{@code .msi},
 * a Linux {@code .deb}/{@code .AppImage} and anything a future release carries are all just assets.
 */
public record ReleaseAsset(String name, long size, String url) {
}
