<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/PirateButton.vue";
import PlatformIcon from "@/vue/PlatformIcon.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";
import { detectPlatform, type Platform } from "@/objects/PlatformDetection.ts";
import {
  fetchLatestRelease,
  findReleaseAsset,
  GITHUB_RELEASES_URL,
  type GithubReleaseAsset,
} from "@/objects/Github.ts";

// The platform-selection screen (#730). The site's "Download" CTAs land here instead of pulling the
// Windows installer straight away, so a visitor can pick the build — Windows or Linux — that runs on
// their machine. Version and asset sizes are read live from the latest GitHub release.

const { t } = useI18n();

// Guessed once per visit: the user agent does not change mid-session, so this needs no reactivity.
const detected = detectPlatform();

const assets = ref<GithubReleaseAsset[]>([]);
const fetchedVersion = ref("");

onMounted(async () => {
  const release = await fetchLatestRelease();
  assets.value = release.assets;
  fetchedVersion.value = release.version;
});

// Shown as "v2.4.1": the GitHub tag first, the backend proxy's manifest version second. Either can
// already carry a leading "v", so it is stripped and the template owns the single prefix.
const version = computed(() =>
  (fetchedVersion.value || AppStore.githubRelease.version || "").replace(
    /^v/i,
    "",
  ),
);

const AUR_COMMAND = "yay -S betterfleet-bin";

/** Download URL + size for the first asset matching an extension, `{}` when the release has none. */
function resolve(ext: string): { url?: string; size?: number } {
  const asset = findReleaseAsset(assets.value, [ext]);
  return { url: asset?.url, size: asset?.size || undefined };
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
  // A real download link, or the releases page as a resilient fallback so it is never dead.
  url?: string;
  size?: number;
  // Not built yet (#727/#740) — rendered as a muted "coming soon" tile rather than a link.
  soon: boolean;
}

// Windows ships both formats. If the API hasn't answered (or an asset is missing) the row still
// points somewhere real — the manifest URL, then the releases page — so it is never a dead link.
const windowsRows = computed<DownloadItem[]>(() => {
  const exe = resolve(".exe");
  const msi = resolve(".msi");
  return [
    {
      id: "exe",
      label: t("downloadPage.windows.exe.label"),
      desc: t("downloadPage.windows.exe.desc"),
      url: exe.url ?? AppStore.githubRelease.url ?? GITHUB_RELEASES_URL,
      size: exe.size,
      soon: false,
    },
    {
      id: "msi",
      label: t("downloadPage.windows.msi.label"),
      desc: t("downloadPage.windows.msi.desc"),
      url: msi.url ?? GITHUB_RELEASES_URL,
      size: msi.size,
      soon: false,
    },
  ];
});

// Linux ships .deb and AppImage; .rpm and Flatpak are not built yet, so they show a "coming soon"
// tile unless some future release happens to carry them.
const linuxTiles = computed<DownloadItem[]>(() => {
  const deb = resolve(".deb");
  const rpm = resolve(".rpm");
  const appimage = resolve(".appimage");
  const flatpak = resolve(".flatpak");
  return [
    {
      id: "deb",
      label: t("downloadPage.linux.deb.label"),
      desc: t("downloadPage.linux.deb.desc"),
      url: deb.url ?? GITHUB_RELEASES_URL,
      size: deb.size,
      soon: false,
    },
    {
      id: "rpm",
      label: t("downloadPage.linux.rpm.label"),
      desc: t("downloadPage.linux.rpm.desc"),
      url: rpm.url,
      size: rpm.size,
      soon: !rpm.url,
    },
    {
      id: "appimage",
      label: t("downloadPage.linux.appimage.label"),
      desc: t("downloadPage.linux.appimage.desc"),
      url: appimage.url ?? GITHUB_RELEASES_URL,
      size: appimage.size,
      soon: false,
    },
    {
      id: "flatpak",
      label: t("downloadPage.linux.flatpak.label"),
      desc: t("downloadPage.linux.flatpak.desc"),
      url: flatpak.url,
      size: flatpak.size,
      soon: !flatpak.url,
    },
  ];
});

interface Recommended {
  platform: Platform;
  title: string;
  desc: string;
  url: string;
  size?: number;
}

// The banner mirrors the detected OS's best format: the Windows installer, or the Linux AppImage
// (the "runs anywhere, no install" option). Null when detection failed — the banner is hidden and
// the visitor picks from the two columns below.
const recommended = computed<Recommended | null>(() => {
  if (detected === "windows") {
    const exe = resolve(".exe");
    return {
      platform: "windows",
      title: t("downloadPage.recommended.windows.title"),
      desc: t("downloadPage.recommended.windows.desc"),
      url: exe.url ?? AppStore.githubRelease.url ?? GITHUB_RELEASES_URL,
      size: exe.size,
    };
  }
  if (detected === "linux") {
    const appimage = resolve(".appimage");
    return {
      platform: "linux",
      title: t("downloadPage.recommended.linux.title"),
      desc: t("downloadPage.recommended.linux.desc"),
      url: appimage.url ?? GITHUB_RELEASES_URL,
      size: appimage.size,
    };
  }
  return null;
});

const aurCopied = ref(false);
let aurTimer: number | undefined;

async function copyAur() {
  try {
    await navigator.clipboard.writeText(AUR_COMMAND);
    aurCopied.value = true;
    clearTimeout(aurTimer);
    aurTimer = window.setTimeout(() => (aurCopied.value = false), 2000);
  } catch {
    // Clipboard blocked (http origin / permissions): the command is on screen to copy by hand.
  }
}
</script>

<template>
  <section class="download-page">
    <header class="hero">
      <h1>{{ t("downloadPage.title") }}</h1>
      <p class="lead">
        {{ detected ? t("downloadPage.lead") : t("downloadPage.leadUnknown") }}
      </p>
    </header>

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
          class="cta"
          :href="recommended.url"
          target="_blank"
          rel="noopener"
          @click="incrementDownload"
        >
          <PirateButton :label="t('downloadPage.download')" />
        </a>
      </div>
    </article>

    <div class="columns">
      <!-- Windows -->
      <article class="os-card">
        <header class="os-head">
          <span class="os-icon"><PlatformIcon platform="windows" /></span>
          <div>
            <h3>{{ t("downloadPage.windows.name") }}</h3>
            <p class="sub">{{ t("downloadPage.windows.editions") }}</p>
          </div>
        </header>
        <div class="rows">
          <a
            v-for="row in windowsRows"
            :key="row.id"
            class="dl"
            :href="row.url"
            target="_blank"
            rel="noopener"
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
        </div>
      </article>

      <!-- Linux -->
      <article class="os-card">
        <header class="os-head">
          <span class="os-icon"><PlatformIcon platform="linux" /></span>
          <div>
            <h3>{{ t("downloadPage.linux.name") }}</h3>
            <p class="sub">{{ t("downloadPage.linux.choose") }}</p>
          </div>
        </header>
        <div class="tiles">
          <template v-for="tile in linuxTiles" :key="tile.id">
            <a
              v-if="!tile.soon"
              class="dl tile"
              :href="tile.url"
              target="_blank"
              rel="noopener"
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
            <div v-else class="dl tile soon">
              <span class="dl-text">
                <span class="dl-label">{{ tile.label }}</span>
                <span class="dl-desc">{{ tile.desc }}</span>
              </span>
              <span class="badge">{{ t("downloadPage.comingSoon") }}</span>
            </div>
          </template>
        </div>

        <!-- Arch: a copy-me command, not a download link. -->
        <div class="aur">
          <span class="aur-label">{{ t("downloadPage.linux.aur.label") }}</span>
          <button type="button" class="aur-cmd" @click="copyAur">
            <code>{{ AUR_COMMAND }}</code>
            <span class="aur-copy">{{
              aurCopied
                ? t("downloadPage.linux.aur.copied")
                : t("downloadPage.linux.aur.copy")
            }}</span>
          </button>
        </div>
      </article>
    </div>

    <p class="all-releases">
      <a :href="GITHUB_RELEASES_URL" target="_blank" rel="noopener">
        {{ t("downloadPage.viewReleases") }}
      </a>
    </p>
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
// the stats best-time banner) — reused so the recommended download reads the same way.
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

    h3 {
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
  gap: 10px;
}

// One shared look for every download affordance — the Windows rows and the Linux tiles.
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

  &:hover:not(.soon) {
    border-color: rgba(50, 212, 153, 0.5);
    background: rgba(50, 212, 153, 0.08);

    .dl-icon {
      color: var(--primary);
    }
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

  &.soon {
    cursor: default;
    opacity: 0.65;

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

.aur {
  display: flex;
  flex-direction: column;
  gap: 8px;

  .aur-label {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--secondary-text);
  }

  .aur-cmd {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    cursor: pointer;
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--primary-background-static);
    border: 1px solid rgba(50, 212, 153, 0.25);
    overflow-x: auto;

    &:hover {
      border-color: rgba(50, 212, 153, 0.5);

      .aur-copy {
        color: var(--primary);
      }
    }

    code {
      font-family: "JetBrains Mono", monospace;
      font-size: 14px;
      color: var(--primary);
      white-space: nowrap;
    }

    .aur-copy {
      flex: 0 0 auto;
      font-size: 12px;
      color: var(--secondary-text);
    }
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

  .recommended .cta {
    width: 100%;
  }

  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
