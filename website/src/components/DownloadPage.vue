<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import PirateButton from "@/vue/PirateButton.vue";
import PlatformIcon from "@/vue/PlatformIcon.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";
import { detectPlatform, Platform } from "@/objects/PlatformDetection.ts";
import {
  fetchLatestReleaseAssets,
  findReleaseAsset,
  GITHUB_RELEASES_URL,
} from "@/objects/Github.ts";

// The platform-selection screen (#730). The site's three "Download" CTAs used to link straight to
// the Windows installer; now that a Linux build is coming (#350), they route here instead, and the
// actual download link lives on this page so there is somewhere to choose from.

const { t } = useI18n();

// Guessed once per visit: the user agent does not change mid-session, so this needs no reactivity.
const detected = detectPlatform();

const linuxDeb = ref<string>();
const linuxAppImage = ref<string>();
const linuxChecked = ref(false);

onMounted(async () => {
  // The Windows link comes from AppStore (a backend proxy already fetched at app start, reading the
  // Tauri updater manifest). Linux has no such proxy yet — the CI/CD issue (#728) that would publish
  // it hasn't shipped — so its assets are read directly from GitHub's release API here instead.
  const assets = await fetchLatestReleaseAssets();
  linuxDeb.value = findReleaseAsset(assets, [".deb"])?.url;
  linuxAppImage.value = findReleaseAsset(assets, [".appimage"])?.url;
  linuxChecked.value = true;
});

interface PlatformCard {
  id: Platform;
  name: string;
  status: string;
  primaryUrl?: string;
  primaryLabel?: string;
  secondaryUrl?: string;
  secondaryLabel?: string;
}

const windowsCard = computed<PlatformCard>(() => {
  const url = AppStore.githubRelease.url;
  return {
    id: "windows",
    name: t("downloadPage.platform.windows.name"),
    status: url
      ? t("downloadPage.platform.windows.status")
      : t("downloadPage.checking"),
    primaryUrl: url,
    primaryLabel: t("downloadPage.platform.windows.cta"),
  };
});

const linuxCard = computed<PlatformCard>(() => {
  if (!linuxChecked.value) {
    return {
      id: "linux",
      name: t("downloadPage.platform.linux.name"),
      status: t("downloadPage.checking"),
    };
  }
  if (linuxDeb.value || linuxAppImage.value) {
    // The .deb is the platform decision (#724); the AppImage — if the release carries one too —
    // is offered as the secondary option rather than dropped.
    const debIsPrimary = !!linuxDeb.value;
    return {
      id: "linux",
      name: t("downloadPage.platform.linux.name"),
      status: t("downloadPage.platform.linux.status"),
      primaryUrl: debIsPrimary ? linuxDeb.value : linuxAppImage.value,
      primaryLabel: debIsPrimary
        ? t("downloadPage.platform.linux.cta")
        : t("downloadPage.platform.linux.ctaAppImage"),
      secondaryUrl: debIsPrimary ? linuxAppImage.value : undefined,
      secondaryLabel: debIsPrimary
        ? t("downloadPage.platform.linux.ctaAppImage")
        : undefined,
    };
  }
  return {
    id: "linux",
    name: t("downloadPage.platform.linux.name"),
    status: t("downloadPage.platform.linux.comingSoon"),
  };
});

const macCard = computed<PlatformCard>(() => ({
  id: "macos",
  name: t("downloadPage.platform.macos.name"),
  status: t("downloadPage.platform.macos.unsupported"),
}));

const cards = computed<PlatformCard[]>(() => [
  windowsCard.value,
  linuxCard.value,
  macCard.value,
]);

const recommended = computed(
  () => cards.value.find((card) => card.id === detected) ?? null,
);
</script>

<template>
  <section class="download-page">
    <header class="hero">
      <h1>{{ t("downloadPage.title") }}</h1>
      <p class="lead">
        {{ detected ? t("downloadPage.lead") : t("downloadPage.leadUnknown") }}
      </p>
    </header>

    <div v-if="recommended" class="recommended">
      <p class="tag">{{ t("downloadPage.recommended") }}</p>
      <div class="recommended-body">
        <span class="icon"><PlatformIcon :platform="recommended.id" /></span>
        <div class="info">
          <h2>{{ recommended.name }}</h2>
          <p>{{ recommended.status }}</p>
        </div>
        <a
          v-if="recommended.primaryUrl"
          class="cta-link"
          :href="recommended.primaryUrl"
          target="_blank"
          @click="incrementDownload"
        >
          <PirateButton :label="recommended.primaryLabel" />
        </a>
      </div>
    </div>

    <div class="platforms">
      <article
        v-for="card in cards"
        :key="card.id"
        class="platform-card"
        :class="{ active: card.id === detected }"
      >
        <span v-if="card.id === detected" class="tag">
          {{ t("downloadPage.recommended") }}
        </span>
        <span class="icon"><PlatformIcon :platform="card.id" /></span>
        <h3>{{ card.name }}</h3>
        <p class="status">{{ card.status }}</p>

        <div class="actions">
          <a
            v-if="card.primaryUrl"
            class="btn primary"
            :href="card.primaryUrl"
            target="_blank"
            @click="incrementDownload"
          >
            {{ card.primaryLabel }}
          </a>
          <a
            v-if="card.secondaryUrl"
            class="btn ghost"
            :href="card.secondaryUrl"
            target="_blank"
            @click="incrementDownload"
          >
            {{ card.secondaryLabel }}
          </a>
        </div>
      </article>
    </div>

    <p class="all-releases">
      <a :href="GITHUB_RELEASES_URL" target="_blank">
        {{ t("downloadPage.viewReleases") }}
      </a>
    </p>
  </section>
</template>

<style scoped lang="scss">
.download-page {
  max-width: 880px;
  margin: 0 auto;
  padding: 56px 24px 80px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.hero {
  text-align: center;

  h1 {
    font-family: BrushTip, sans-serif;
    font-size: 52px;
  }

  .lead {
    color: var(--secondary-text);
    max-width: 56ch;
    margin: 8px auto 0;
    line-height: 1.6;
  }
}

// The green-tinted callout the site already uses for "the one thing that matters here" (the mobile
// pc-card on the home hero, the stats dashboard's best-time banner) — reused so the recommended
// platform reads the same way.
.recommended {
  background: rgba(50, 212, 153, 0.1);
  border: 1px solid rgba(50, 212, 153, 0.35);
  border-radius: 14px;
  padding: 20px 24px;

  .recommended-body {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }

  .icon {
    flex: 0 0 auto;
    width: 40px;
    height: 40px;
    color: var(--primary);
  }

  .info {
    flex: 1 1 220px;

    h2 {
      font-size: 22px;
    }

    p {
      color: var(--secondary-text);
      margin-top: 2px;
    }
  }

  .cta-link {
    flex: 0 0 auto;
  }
}

.tag {
  display: inline-flex;
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  color: var(--primary);
  margin-bottom: 10px;
}

.platforms {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 18px;
}

.platform-card {
  display: flex;
  flex-direction: column;
  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  &.active {
    border-color: rgba(50, 212, 153, 0.45);
  }

  .icon {
    width: 30px;
    height: 30px;
    margin-bottom: 12px;
  }

  h3 {
    font-size: 18px;
  }

  .status {
    color: var(--secondary-text);
    margin-top: 6px;
    line-height: 1.55;
    flex: 1;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 18px;
  }
}

.btn {
  min-height: 46px;
  padding: 0 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  text-align: center;
  font-weight: 600;
  font-size: 15px;
}

.btn.primary {
  background: var(--primary);
  color: #0b241b;
  border: none;
}

.btn.ghost {
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: var(--primary-text);
  font-weight: 400;
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
}
</style>
