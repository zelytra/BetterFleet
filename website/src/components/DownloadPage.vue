<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/PirateButton.vue";
import PlatformIcon from "@/vue/PlatformIcon.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";
import { useDelayedLoading } from "@/objects/DelayedLoading.ts";
import { detectPlatform, type Platform } from "@/objects/PlatformDetection.ts";
import {
  fetchLatestRelease,
  findReleaseAsset,
  GITHUB_RELEASES_URL,
  type GithubReleaseAsset,
} from "@/objects/Github.ts";

// The platform-selection screen (#730). The site's "Download" CTAs land here instead of pulling the
// Windows installer straight away, so a visitor can pick the build - Windows or Linux - that runs on
// their machine. Every tile downloads the matching asset *directly* from the latest GitHub release
// (its browser_download_url), with the version and size read live from that release. A format that
// the latest release doesn't carry yet shows a "coming soon" state and turns into a direct download
// on its own the moment a release includes it - no redirect anywhere. The one link that leaves for
// github.com is the "browse every release" line at the bottom.
//
// If the release can't be fetched at all (backend proxy down AND GitHub unreachable), the page does
// NOT fall back to a wall of "coming soon" - that would tell a visitor the software doesn't exist.
// It shows an error panel pointing straight at the GitHub releases page instead.

const { t } = useI18n();

// Guessed once per visit: the user agent does not change mid-session, so this needs no reactivity.
const detected = detectPlatform();

const assets = ref<GithubReleaseAsset[]>([]);
const fetchedVersion = ref("");
// True until the release fetch settles. While it holds, a tile whose asset isn't in `assets` yet is
// still *loading*, not missing - it shows a spinner rather than "coming soon", so a format the release
// does carry never flashes "coming soon" on its way in. Only once this clears does an absent asset
// mean the format genuinely isn't published.
const loading = ref(true);
// The fetch reached neither the backend proxy nor GitHub: a real failure, kept distinct from a
// release that is merely empty. It swaps the whole picker for an error panel, so a network problem
// never masquerades as "every format is coming soon".
const error = ref(false);
// The spinner rides the *delayed* flag: a cached release (the common case) resolves inside the delay
// and never flashes it. The "coming soon" fallback, by contrast, stays gated on the real `loading`
// below, so a format the release does carry can't flash "coming soon" during that same delay.
const showSpinner = useDelayedLoading(loading);

onMounted(async () => {
  try {
    const release = await fetchLatestRelease();
    if (release) {
      assets.value = release.assets;
      fetchedVersion.value = release.version;
    } else {
      // Neither source answered: show the error panel, not a page of "coming soon".
      error.value = true;
    }
  } catch {
    // fetchLatestRelease resolves rather than throwing, but guard anyway - an unexpected throw is a
    // failure to reach the release, not an empty release.
    error.value = true;
  } finally {
    loading.value = false;
  }
});

// Shown as "v2.4.1": the GitHub tag first, the backend proxy's manifest version second. Either can
// already carry a leading "v", so it is stripped and the template owns the single prefix.
const version = computed(() =>
  (fetchedVersion.value || AppStore.githubRelease.version || "").replace(
    /^v/i,
    "",
  ),
);

// Direct download URL (browser_download_url), size and real file name for the first asset matching an
// extension. All undefined when the latest release carries no such asset - the caller renders "coming
// soon" then. The `name` is what a copyable install command is built from, so it stays a real filename.
function resolve(ext: string): { url?: string; size?: number; name?: string } {
  const asset = findReleaseAsset(assets.value, [ext]);
  return { url: asset?.url, size: asset?.size || undefined, name: asset?.name };
}

// Human-readable megabytes, e.g. "48 MB" / "48 Mo". Empty until the size is known.
function sizeLabel(bytes?: number): string {
  if (!bytes) return "";
  return `${Math.round(bytes / (1024 * 1024))} ${t("downloadPage.megabytes")}`;
}

interface DownloadItem {
  id: string;
  label: string;
  desc: string;
  // A direct GitHub asset download; undefined => the release doesn't carry this format yet.
  url?: string;
  size?: number;
  // The command to run *after* downloading this package (e.g. `sudo pacman -U ~/Downloads/…`), built
  // from the resolved asset's real filename. Undefined when this format has no such step, or isn't
  // published yet - so it renders only alongside a real, present download.
  command?: string;
}

const windowsRows = computed<DownloadItem[]>(() => {
  const exe = resolve(".exe");
  return [
    {
      id: "exe",
      label: t("downloadPage.windows.exe.label"),
      desc: t("downloadPage.windows.exe.desc"),
      url: exe.url,
      size: exe.size,
    },
  ];
});

const linuxTiles = computed<DownloadItem[]>(() => {
  const deb = resolve(".deb");
  const rpm = resolve(".rpm");
  // The pacman package: `betterfleet-bin-<version>-x86_64.pkg.tar.zst`. Matched on the full
  // `.pkg.tar.zst` suffix rather than a bare `.zst` so nothing else in the release can stand in for it.
  const arch = resolve(".pkg.tar.zst");
  return [
    {
      id: "deb",
      label: t("downloadPage.linux.deb.label"),
      desc: t("downloadPage.linux.deb.desc"),
      url: deb.url,
      size: deb.size,
      // Install the freshly downloaded .deb. `~/Downloads/` targets where the browser saved it (a
      // bare `./name` would assume the terminal is already sitting in the download folder), and the
      // leading path makes apt treat it as a file rather than a repo name.
      command: deb.name
        ? `sudo apt install ~/Downloads/${deb.name}`
        : undefined,
    },
    {
      id: "rpm",
      label: t("downloadPage.linux.rpm.label"),
      desc: t("downloadPage.linux.rpm.desc"),
      url: rpm.url,
      size: rpm.size,
      // Install the downloaded .rpm with dnf, giving rpm the same copy-and-run parity as .deb/Arch.
      command: rpm.name
        ? `sudo dnf install ~/Downloads/${rpm.name}`
        : undefined,
    },
    {
      id: "arch",
      label: t("downloadPage.linux.arch.label"),
      desc: t("downloadPage.linux.arch.desc"),
      url: arch.url,
      size: arch.size,
      // Install the downloaded package file directly with pacman, from the browser's download folder.
      command: arch.name
        ? `sudo pacman -U ~/Downloads/${arch.name}`
        : undefined,
    },
  ];
});

interface Recommended {
  platform: Platform;
  title: string;
  desc: string;
  url?: string;
  size?: number;
}

// The banner mirrors the detected OS's best single download - and only Windows has one (the installer).
// It's null for Linux just as for failed detection: no single package fits every distribution
// (Debian/Fedora/Arch diverge), so a Linux visitor gets no banner and picks from the tiles below. When
// the .exe isn't in the release yet, the button shows "coming soon" rather than linking to github.com.
const recommended = computed<Recommended | null>(() => {
  if (detected === "windows") {
    const exe = resolve(".exe");
    return {
      platform: "windows",
      title: t("downloadPage.recommended.windows.title"),
      desc: t("downloadPage.recommended.windows.desc"),
      url: exe.url,
      size: exe.size,
    };
  }
  return null;
});

// The intro line under the title. Windows gets the "we picked one for you" copy the banner backs up;
// Linux is detected but has no single recommended package, so it gets a "pick your distribution's
// package below" prompt instead of implying a pick was made; anything else is the couldn't-detect line.
const leadText = computed(() => {
  if (detected === "windows") return t("downloadPage.lead");
  if (detected === "linux") return t("downloadPage.leadLinux");
  return t("downloadPage.leadUnknown");
});

// Per-package install commands (the .deb, .rpm and Arch tiles): each tile carries its own `command`,
// copied to the clipboard on click. `copyResult` records which tile was last acted on and whether the
// write succeeded, driving the brief acknowledgement on that tile and the single live region.
const copyResult = ref<{ id: string; ok: boolean } | null>(null);
let copyTimer: number | undefined;

async function copyCommand(id: string, command?: string) {
  if (!command) return;
  try {
    await navigator.clipboard.writeText(command);
    copyResult.value = { id, ok: true };
  } catch {
    // Clipboard blocked (http origin / denied permission). The strip opts back into text selection
    // (see the style block), so the fallback is to select the command by hand - the swapped label and
    // the live region say so, rather than the click silently doing nothing.
    copyResult.value = { id, ok: false };
  }
  clearTimeout(copyTimer);
  // A failure lingers longer: it asks the visitor to do something, so it shouldn't vanish as quickly
  // as a "Copied!" that just confirms.
  const linger = copyResult.value.ok ? 2000 : 5000;
  copyTimer = window.setTimeout(() => (copyResult.value = null), linger);
}

// The one polite live region's text - announced when a copy resolves, then cleared. The visible
// per-tile label is aria-hidden, so this is the only thing a screen reader hears about the result.
const copyAnnouncement = computed(() => {
  if (!copyResult.value) return "";
  return copyResult.value.ok
    ? t("downloadPage.linux.copied")
    : t("downloadPage.linux.copyFailed");
});

// The visible label on a tile's command strip: "Copy", then "Copied!" / "Copy failed…" for the tile
// just used.
function commandLabel(id: string): string {
  if (copyResult.value?.id === id) {
    return copyResult.value.ok
      ? t("downloadPage.linux.copied")
      : t("downloadPage.linux.copyFailed");
  }
  return t("downloadPage.linux.copy");
}

function copyFailedOn(id: string): boolean {
  return copyResult.value?.id === id && !copyResult.value.ok;
}

// A download link's accessible name gets a verb: "Download <label>" reads as an action, where the bare
// visible label (".deb", "Arch (pacman)") would not.
function downloadAria(label: string): string {
  return `${t("downloadPage.download")} ${label}`;
}

onUnmounted(() => clearTimeout(copyTimer));
</script>

<template>
  <section class="download-page">
    <header class="hero">
      <h1>{{ t("downloadPage.title") }}</h1>
      <p v-if="!error" class="lead">
        {{ leadText }}
      </p>
    </header>

    <!-- Couldn't reach the release: a real, honest failure state instead of a page of "coming soon".
         It hands the visitor the one path that still works - the GitHub releases page. -->
    <article v-if="error" class="fetch-error" role="alert">
      <span class="err-icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
          />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </span>
      <div class="err-body">
        <h2>{{ t("downloadPage.error.title") }}</h2>
        <p>{{ t("downloadPage.error.body") }}</p>
      </div>
      <a
        class="cta"
        :href="GITHUB_RELEASES_URL"
        target="_blank"
        rel="noopener"
        :aria-label="t('downloadPage.error.cta')"
      >
        <PirateButton :label="t('downloadPage.error.cta')" />
      </a>
    </article>

    <template v-else>
      <!-- Recommended-for-your-system banner, reusing the site's green "the one that matters" callout. -->
      <article v-if="recommended" class="recommended">
        <p class="tag">{{ t("downloadPage.recommendedLabel") }}</p>
        <div class="recommended-body">
          <span class="os-icon"
            ><PlatformIcon :platform="recommended.platform"
          /></span>
          <div class="info">
            <h2>{{ recommended.title }}</h2>
            <p class="meta">
              <template v-if="version">v{{ version }} · </template>
              {{ t("downloadPage.sixtyFourBit") }}
              <template v-if="sizeLabel(recommended.size)">
                · {{ sizeLabel(recommended.size) }}</template
              >
              · {{ recommended.desc }}
            </p>
          </div>
          <a
            v-if="recommended.url"
            class="cta"
            :href="recommended.url"
            :aria-label="downloadAria(recommended.title)"
            @click="incrementDownload"
          >
            <PirateButton :label="t('downloadPage.download')" />
          </a>
          <span
            v-else-if="loading"
            class="cta-loading"
            role="status"
            :aria-label="t('downloadPage.loading')"
            aria-busy="true"
          >
            <span v-if="showSpinner" class="spinner" aria-hidden="true"></span>
          </span>
          <span v-else class="cta-soon">{{
            t("downloadPage.comingSoon")
          }}</span>
        </div>
      </article>

      <div class="columns">
        <!-- Windows -->
        <article class="os-card">
          <header class="os-head">
            <span class="os-icon"><PlatformIcon platform="windows" /></span>
            <div>
              <h2>{{ t("downloadPage.windows.name") }}</h2>
              <p class="sub">{{ t("downloadPage.windows.editions") }}</p>
            </div>
          </header>
          <div class="rows">
            <template v-for="row in windowsRows" :key="row.id">
              <a
                v-if="row.url"
                class="dl"
                :href="row.url"
                :aria-label="downloadAria(row.label)"
                @click="incrementDownload"
              >
                <span class="dl-text">
                  <span class="dl-label">{{ row.label }}</span>
                  <span class="dl-desc">{{ row.desc }}</span>
                </span>
                <span class="dl-meta">
                  <span v-if="sizeLabel(row.size)" class="dl-size">{{
                    sizeLabel(row.size)
                  }}</span>
                  <svg
                    class="dl-icon"
                    viewBox="0 0 20 20"
                    fill="none"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M10 3v9m0 0 3.2-3.2M10 12 6.8 8.8"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                    <path
                      d="M4.5 15.5h11"
                      stroke="currentColor"
                      stroke-width="1.6"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
              </a>
              <div
                v-else-if="loading"
                class="dl loading"
                role="status"
                :aria-label="t('downloadPage.loading')"
                aria-busy="true"
              >
                <span class="dl-text">
                  <span class="dl-label">{{ row.label }}</span>
                  <span class="dl-desc">{{ row.desc }}</span>
                </span>
                <span class="dl-meta">
                  <span
                    v-if="showSpinner"
                    class="spinner"
                    aria-hidden="true"
                  ></span>
                </span>
              </div>
              <div v-else class="dl soon">
                <span class="dl-text">
                  <span class="dl-label">{{ row.label }}</span>
                  <span class="dl-desc">{{ row.desc }}</span>
                </span>
                <span class="badge">{{ t("downloadPage.comingSoon") }}</span>
              </div>
            </template>
          </div>
          <p class="update-note">
            <svg
              class="note-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path
                d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"
              />
            </svg>
            <span>{{ t("downloadPage.windows.updates") }}</span>
          </p>
        </article>

        <!-- Linux -->
        <article class="os-card">
          <header class="os-head">
            <span class="os-icon"><PlatformIcon platform="linux" /></span>
            <div>
              <h2>{{ t("downloadPage.linux.name") }}</h2>
              <p class="sub">{{ t("downloadPage.linux.choose") }}</p>
            </div>
          </header>
          <div class="tiles">
            <template v-for="tile in linuxTiles" :key="tile.id">
              <div class="tile-cell">
                <a
                  v-if="tile.url"
                  class="dl tile"
                  :href="tile.url"
                  :aria-label="downloadAria(tile.label)"
                  @click="incrementDownload"
                >
                  <span class="dl-text">
                    <span class="dl-label">{{ tile.label }}</span>
                    <span class="dl-desc">{{ tile.desc }}</span>
                  </span>
                  <span class="dl-meta">
                    <span v-if="sizeLabel(tile.size)" class="dl-size">{{
                      sizeLabel(tile.size)
                    }}</span>
                    <svg
                      class="dl-icon"
                      viewBox="0 0 20 20"
                      fill="none"
                      aria-hidden="true"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M10 3v9m0 0 3.2-3.2M10 12 6.8 8.8"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <path
                        d="M4.5 15.5h11"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                </a>
                <div
                  v-else-if="loading"
                  class="dl tile loading"
                  role="status"
                  :aria-label="t('downloadPage.loading')"
                  aria-busy="true"
                >
                  <span class="dl-text">
                    <span class="dl-label">{{ tile.label }}</span>
                    <span class="dl-desc">{{ tile.desc }}</span>
                  </span>
                  <span class="dl-meta">
                    <span
                      v-if="showSpinner"
                      class="spinner"
                      aria-hidden="true"
                    ></span>
                  </span>
                </div>
                <div v-else class="dl tile soon">
                  <span class="dl-text">
                    <span class="dl-label">{{ tile.label }}</span>
                    <span class="dl-desc">{{ tile.desc }}</span>
                  </span>
                  <span class="badge">{{ t("downloadPage.comingSoon") }}</span>
                </div>

                <!-- The command to run after downloading this package. Rendered only when the release
                     actually carries the file, so its name (and the command) are real; click anywhere on
                     the strip to copy it, or select and copy it by hand if the clipboard is blocked. -->
                <button
                  v-if="tile.url && tile.command"
                  type="button"
                  class="tile-cmd"
                  :class="{ 'copy-failed': copyFailedOn(tile.id) }"
                  :aria-label="t('downloadPage.linux.copyCommand')"
                  @click="copyCommand(tile.id, tile.command)"
                >
                  <code>{{ tile.command }}</code>
                  <span class="tile-cmd-copy" aria-hidden="true">{{
                    commandLabel(tile.id)
                  }}</span>
                </button>
              </div>
            </template>
          </div>
          <p class="update-note">
            <svg
              class="note-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
            <span>{{ t("downloadPage.linux.updates") }}</span>
          </p>
        </article>
      </div>
    </template>

    <p class="all-releases">
      <a :href="GITHUB_RELEASES_URL" target="_blank" rel="noopener">
        {{ t("downloadPage.viewReleases") }}
      </a>
    </p>

    <!-- One polite live region for the copy-to-clipboard result; the visible per-tile labels are
         aria-hidden, so this is what a screen reader announces. -->
    <span
      class="visually-hidden"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      >{{ copyAnnouncement }}</span
    >
  </section>
</template>

<style scoped lang="scss">
.download-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 56px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.hero {
  text-align: center;

  h1 {
    font-family: BrushTip, sans-serif;
    font-size: 52px;
    color: var(--primary);
  }

  .lead {
    color: var(--secondary-text);
    max-width: 56ch;
    margin: 8px auto 0;
    line-height: 1.6;
  }
}

.tag {
  display: inline-flex;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--primary);
}

// The green-tinted "the one thing that matters here" callout the site already uses (home hero pc-card,
// the stats best-time banner) - reused so the recommended download reads the same way.
.recommended {
  background: rgba(50, 212, 153, 0.1);
  border: 1px solid rgba(50, 212, 153, 0.35);
  border-radius: 14px;
  padding: 20px 24px;

  .tag {
    margin-bottom: 12px;
  }

  .recommended-body {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }

  .os-icon {
    flex: 0 0 auto;
    width: 42px;
    height: 42px;
    color: var(--primary);
  }

  .info {
    flex: 1 1 220px;
    min-width: 0;

    h2 {
      font-size: 22px;
    }

    .meta {
      color: var(--secondary-text);
      margin-top: 4px;
      line-height: 1.5;
    }
  }

  .cta {
    flex: 0 0 auto;
  }

  // Release still loading: a spinner sits where the download button will land, holding its height so
  // the banner doesn't jump when the real button (or the "coming soon" chip) resolves.
  .cta-loading {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    min-width: 46px;
  }

  // Recommended format not in the release yet: a muted, non-clickable "coming soon" chip in place of
  // the download button - never a link off to github.com.
  .cta-soon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    min-height: 46px;
    padding: 0 20px;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    color: var(--warning);
    border: 1px solid rgba(255, 190, 92, 0.35);
    background: rgba(255, 190, 92, 0.08);
  }
}

// The couldn't-reach-the-release panel. Same shape as the recommended callout, in the amber "warning"
// palette the "coming soon" chips already use, with a prominent button to the one path that still
// works. Shown in place of the whole picker, so a failed fetch never reads as "everything is coming
// soon".
.fetch-error {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  background: rgba(255, 190, 92, 0.08);
  border: 1px solid rgba(255, 190, 92, 0.35);
  border-radius: 14px;
  padding: 20px 24px;

  .err-icon {
    flex: 0 0 auto;
    width: 34px;
    height: 34px;
    color: var(--warning);
  }

  .err-body {
    flex: 1 1 240px;
    min-width: 0;

    h2 {
      font-size: 20px;
    }

    p {
      color: var(--secondary-text);
      margin-top: 4px;
      line-height: 1.5;
    }
  }

  .cta {
    flex: 0 0 auto;
  }
}

.columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.os-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  .os-head {
    display: flex;
    align-items: center;
    gap: 14px;

    .os-icon {
      flex: 0 0 auto;
      width: 30px;
      height: 30px;
      color: var(--primary);
    }

    h2 {
      font-size: 18px;
    }

    .sub {
      color: var(--secondary-text);
      font-size: 14px;
      margin-top: 2px;
    }
  }
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: start;
  gap: 10px;
}

// A quiet footnote under each OS's downloads saying how that platform updates - Windows updates
// itself, Linux is a manual re-download. Kept deliberately light (muted text, a small accent glyph,
// no card or border) so it reads as a hint below the tiles, never a second banner. Static content, so
// it adds no layout shift as the release resolves.
.update-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--secondary-text);

  .note-icon {
    flex: 0 0 auto;
    width: 15px;
    height: 15px;
    margin-top: 1px;
    color: var(--primary);
  }
}

// One shared look for every download affordance - the Windows rows and the Linux tiles.
.dl {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 58px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  cursor: pointer;

  &:hover:not(.soon):not(.loading) {
    border-color: rgba(50, 212, 153, 0.5);
    background: rgba(50, 212, 153, 0.08);

    .dl-icon {
      color: var(--primary);
    }
  }

  // Still fetching the release: not a link, so it neither invites a click nor dims like "coming soon"
  // - the tile just holds its shape while the single spinner in its meta slot turns.
  &.loading {
    cursor: default;
  }

  .dl-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .dl-label {
    font-size: 15px;
    color: var(--primary-text);
  }

  .dl-desc {
    font-size: 12.5px;
    color: var(--secondary-text);
    line-height: 1.35;
  }

  .dl-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 0 0 auto;
  }

  .dl-size {
    font-size: 12px;
    color: var(--secondary-text);
    white-space: nowrap;
  }

  .dl-icon {
    width: 20px;
    height: 20px;
    color: var(--secondary-text);
  }

  // Format not published yet. Dimmed deliberately, but only to 0.8: the blanket 0.65 it used to carry
  // dropped the label/desc below the WCAG-AA contrast floor, so an unavailable option became one a
  // low-vision visitor couldn't actually read.
  &.soon {
    cursor: default;
    opacity: 0.8;

    .badge {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      color: var(--warning);
      border: 1px solid rgba(255, 190, 92, 0.35);
      background: rgba(255, 190, 92, 0.08);
      padding: 3px 8px;
      border-radius: 999px;
      white-space: nowrap;
    }
  }
}

// A small, CSS-only "still loading" spinner: the site's green accent ring turning against a faint
// track. One spinner stands in for a whole download affordance - a tile's size and button together,
// or the banner's button - while the latest release is fetched, so nothing shows "coming soon" until
// we actually know the format is absent.
.spinner {
  display: inline-block;
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  border: 2px solid rgba(50, 212, 153, 0.25);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spinner-spin 0.7s linear infinite;
}

@keyframes spinner-spin {
  to {
    transform: rotate(360deg);
  }
}

// Reduced motion: keep it turning (a frozen ring reads as a hang, not a wait) but slow it right down
// so it no longer sweeps.
@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation-duration: 1.6s;
  }
}

// Each Linux tile is a small vertical stack: the download tile, and - for the packages that ship one -
// a copyable install command beneath it. `align-items: start` on the grid keeps a stack without a
// command from stretching to a taller neighbour's height, so no tile grows blank space.
.tile-cell {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

// The command to paste after downloading a native package (.deb, .rpm, Arch .pkg.tar.zst): a
// copy-on-click monospace strip, recessed against the darker static background so it reads as a code
// line rather than a second download. Long commands scroll inside it instead of widening the tile.
.tile-cmd {
  all: unset;
  // Opt this strip back into text selection: style.scss sets `user-select: none` on everything, which
  // would otherwise make the promised "select and copy it by hand" clipboard fallback impossible.
  user-select: text;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--primary-background-static);
  border: 1px solid rgba(50, 212, 153, 0.25);
  overflow-x: auto;

  &:hover {
    border-color: rgba(50, 212, 153, 0.5);

    .tile-cmd-copy {
      color: var(--primary);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  // Clipboard write failed: turn the strip amber and colour its label so the "Copy failed - select and
  // copy" swap reads as a state change, not just different words.
  &.copy-failed {
    border-color: rgba(255, 190, 92, 0.6);

    .tile-cmd-copy {
      color: var(--warning);
    }
  }

  code {
    font-family: "JetBrains Mono", monospace;
    font-size: 12.5px;
    color: var(--primary);
    white-space: nowrap;
    user-select: text;
  }

  .tile-cmd-copy {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--secondary-text);
  }
}

.all-releases {
  text-align: center;
  color: var(--secondary-text);
  font-size: 14px;

  a {
    color: var(--secondary-text);
    text-decoration: underline;

    &:hover {
      color: var(--primary-text);
    }
  }
}

// Screen-reader-only: kept out of sight but in the accessibility tree, so the live region can announce
// the copy result without anything showing on screen.
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

// Tablets and phones: the two OS columns stack, and the Linux tiles fall to one per row so nothing
// gets squeezed.
@media (max-width: $lap) {
  .columns {
    grid-template-columns: 1fr;
  }
}

@media (max-width: $palm) {
  .download-page {
    padding: 40px 16px 60px;
  }

  .hero h1 {
    font-size: 38px;
  }

  .recommended .recommended-body {
    flex-direction: column;
    align-items: flex-start;
  }

  .recommended .cta,
  .recommended .cta-soon,
  .recommended .cta-loading {
    width: 100%;
  }

  .recommended .cta-soon {
    justify-content: center;
  }

  // The error panel stacks the same way, and its button goes full-width for a comfortable tap target.
  .fetch-error {
    flex-direction: column;
    align-items: flex-start;
  }

  .fetch-error .cta {
    width: 100%;
  }

  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
