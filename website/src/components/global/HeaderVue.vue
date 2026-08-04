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
      <!-- Also carries the phone-only entries: joining a session is done from the device in your
           hand, and the guide tells console players to come here and type their code (#682). -->
      <router-link
        v-for="route in routes.filter(
          (x) => x.meta.displayInNav || x.meta.displayInMobileNav,
        )"
        :key="route.name"
        :to="mobileNavTarget(route)"
        @click="menuOpen = false"
      >
        {{ t(route.meta.navLabel ?? route.name) }}
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
import { useI18n } from "vue-i18n";
import { ref } from "vue";

const { t } = useI18n();
// Phone-only full-screen nav (#670): the burger is displayed below $palm, so this never opens on
// desktop; picking a destination closes it.
const menuOpen = ref(false);

// A route's `path` is a pattern, not a URL: the session route is "/s/:code?", and linking to that
// literally would navigate to a path containing a colon. Strip the optional segment so the entry
// lands on the join form with the code field empty.
function mobileNavTarget(route: { path: string }): string {
  const stripped = route.path.replace(/\/:[^/]+\?$/, "");
  return stripped.length > 0 ? stripped : "/";
}
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

// The burger and the full-screen menu exist only below $lap; on anything wider the classic nav
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

// Below $lap — phones AND tablets (#670): the desktop-squeezed header (wrapped 22px links + the
// 78px "try the app" banner) becomes a 56px sticky bar — real logo, burger, nothing else. The
// download button goes with it: these devices cannot install the Windows app, the hero says so.
@media (max-width: $lap) {
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
