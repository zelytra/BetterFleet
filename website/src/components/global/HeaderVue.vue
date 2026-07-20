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
      :href="AppStore.githubRelease.url"
      target="_blank"
    >
      <PirateButton
        :label="t('button.download')"
        @on-button-click="incrementDownload"
      />
    </a>
  </header>
  <div class="header-details">
    <img src="@/assets/icons/fire.svg" alt="fire icon" />
    <p>{{ t("header.details") }}</p>
  </div>
</template>

<script setup lang="ts">
import { routes } from "@/router";
import PirateButton from "@/vue/PirateButton.vue";
import { useI18n } from "vue-i18n";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";

const { t } = useI18n();
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

@media (max-width: $palm) {
  header {
    img {
      height: 44px;
    }

    nav {
      gap: 20px;
      font-size: 15px;
    }
  }

  .header-details {
    gap: 12px;
    // width: 100% with no border-box: the padding is added to it and the bar runs 24px off screen.
    box-sizing: border-box;
    padding: 0 12px;
    height: 78px;

    img {
      height: 32px;
    }

    p {
      font-size: 14px;
      text-align: center;
    }
  }
}
</style>
