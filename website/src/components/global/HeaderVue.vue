<template>
  <header>
    <img src="@/assets/icons/logo.svg" alt="app icon" />
    <nav>
      <router-link
        v-for="route in routes.filter((x) => x.meta.displayInNav)"
        :key="route.name"
        class="router-link"
        :to="route.path"
      >
        {{ t(route.name) }}
      </router-link>
    </nav>
    <a
      v-if="AppStore.githubRelease.url"
      class="download-cta"
      :href="AppStore.githubRelease.url"
      target="_blank"
    >
      <PirateButton
        :label="t('button.download')"
        @on-button-click="incrementDownload"
      />
    </a>
    <button
      class="burger"
      :class="{ open: menuOpen }"
      aria-label="Menu"
      @click="menuOpen = !menuOpen"
    >
      <span></span><span></span><span></span>
    </button>
  </header>
  <transition>
    <nav v-if="menuOpen" class="mobile-menu">
      <router-link
        v-for="route in routes.filter((x) => x.meta.displayInNav)"
        :key="route.name"
        :to="route.path"
        @click="menuOpen = false"
      >
        {{ t(route.name) }}
      </router-link>
    </nav>
  </transition>
  <div class="header-details">
    <img src="@/assets/icons/fire.svg" alt="fire icon" />
    <p>{{ t("header.details") }}</p>
  </div>
</template>

<script setup lang="ts">
import { routes } from "@/router";
import PirateButton from "@/vue/PirateButton.vue";
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";

const { t } = useI18n();
// Phone-only full-screen nav (#670): the burger is displayed below $palm, so this never opens on
// desktop; picking a destination closes it.
const menuOpen = ref(false);
</script>

<style scoped lang="scss">
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  box-sizing: border-box;
  padding: 0 24px 12px;
  height: 90px;
  background: url("@/assets/backgrounds/header.svg") repeat-x 50% 95%/1200px
    144px;
  position: relative;
  z-index: 4;
  margin-bottom: 35px;

  img {
    height: 60px;
  }

  nav {
    position: absolute;
    top: 43%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    align-items: center;
    gap: 48px;

    .router-link-active {
      color: var(--primary);
    }
  }
}

.header-details {
  display: flex;
  align-items: center;
  width: 100%;
  justify-content: center;
  gap: 24px;
  top: 50px;
  z-index: 3;
  position: absolute;
  background: url("@/assets/backgrounds/header-details.svg") repeat-x 50%
    100%/1200px 144px;
  height: 120px;

  p {
    color: var(--warning);
  }
}

// The nav is absolutely centred on the bar, so it does not take part in the row's layout and nothing
// pushes it aside. Below roughly 900px it simply sits on top of the logo — at 375px "Accueil" is
// printed across the ship. Logo, nav and the download button want 453px between them, so one row
// cannot hold them here; the nav drops to its own line instead.
@media (max-width: $lap) {
  header {
    height: auto;
    flex-wrap: wrap;
    justify-content: space-between;
    padding: 12px 16px;
    // The torn-edge background is a 1200px-wide tile anchored at 95%; on a short bar it crops to a
    // sliver, so it is anchored to the bottom and allowed to scale down with the bar.
    background-position: 50% 100%;
    background-size: 900px 108px;

    nav {
      position: static;
      transform: none;
      order: 3;
      width: 100%;
      justify-content: center;
      gap: 32px;
      padding-top: 4px;
    }
  }

  // Absolutely placed 50px down the page to tuck under a 90px bar. The bar is taller than that once
  // the nav wraps, so it flows after the header instead of being pinned into it.
  .header-details {
    position: static;
    height: 90px;
    background-size: 900px 108px;
  }
}

// The burger and the full-screen menu exist only below $palm; on anything wider the classic nav
// row does the job and these stay out of the way.
.burger {
  display: none;
  flex-direction: column;
  gap: 5px;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 0;
  background: none;
  cursor: pointer;
  padding: 0;

  span {
    width: 22px;
    height: 2px;
    border-radius: 2px;
    background: var(--primary-text);
    transition:
      transform 0.2s ease,
      opacity 0.2s ease;
  }

  &.open span:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }
  &.open span:nth-child(2) {
    opacity: 0;
  }
  &.open span:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }
}

.mobile-menu {
  display: none;
}

// Phone (#670): the desktop-squeezed header (wrapped 22px links + the 78px "try the app" banner)
// becomes a 56px sticky bar — real logo, burger, nothing else. The download button goes with it:
// a phone cannot install the Windows app, the hero says so instead.
@media (max-width: $palm) {
  header {
    position: sticky;
    top: 0;
    height: 56px;
    flex-wrap: nowrap;
    padding: 6px 14px;
    margin-bottom: 0;
    background: rgba(23, 26, 33, 0.95);
    backdrop-filter: blur(6px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);

    img {
      height: 36px;
    }

    nav {
      display: none;
    }

    .download-cta {
      display: none;
    }

    .burger {
      display: flex;
    }
  }

  .mobile-menu {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    position: fixed;
    inset: 56px 0 0 0;
    z-index: 20;
    background: rgba(13, 15, 20, 0.98);
    padding: 24px 20px;
    gap: 4px;

    a {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      border-radius: 10px;
      font-size: 18px;
      color: var(--primary-text);

      &.router-link-active {
        color: var(--primary);
        background: rgba(50, 212, 153, 0.1);
      }
    }
  }

  .header-details {
    display: none;
  }
}
</style>
