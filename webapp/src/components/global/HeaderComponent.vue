<template>
  <div class="nav-wrapper">
    <nav>
      <img src="@/assets/icons/logo.svg" alt="nav-icon" />
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="58"
        height="7"
        viewBox="0 0 58 7"
        fill="none"
      >
        <path
          d="M14.1599 0.00696579C16.0228 0.0619114 24.764 1.50535 25.8488 1.20185C28.6323 0.422001 31.8348 0.852195 35.2637 1.74432C38.4362 2.56963 41.3292 2.72352 43.9192 2.12912C46.426 1.55399 49.3567 1.72128 52.3575 2.02595C53.2429 2.11599 54.1208 2.20335 55.0092 2.3091C56.7043 2.51113 57.6788 3.44938 57.0284 4.29859C56.4559 5.04836 55.4138 5.49419 54.0674 5.57755C52.2264 5.6903 50.3075 5.68737 48.3844 5.6487C42.6242 5.53103 36.843 5.37659 31.0679 5.22917L17.636 5.82963C14.5993 5.88865 11.6073 6.03692 8.64524 6.2203C6.62867 6.34885 4.89647 5.84514 3.37772 4.47862C2.65665 3.83098 1.90541 3.17261 1.32215 2.49577C0.590509 1.63902 0.732958 0.97585 1.75116 0.69264C2.64663 0.444003 3.65948 0.271353 4.72269 0.243729C7.16363 0.187905 9.66728 0.242391 12.1516 0.255768C12.3043 0.256309 12.493 0.298987 12.6293 0.274119C13.15 0.195326 13.6527 0.0954642 14.1599 0.00696579Z"
          fill="#32D499"
          fill-opacity="0.5"
        />
      </svg>
      <router-link
        v-for="route in routes[1].children!.filter((x) => x.meta.displayInNav)"
        :key="route.name"
        class="router-link"
        :to="route.path"
        :title="t('tooltips.navbar.' + route.meta.tooltip)"
      >
        <img v-if="route.meta" :src="route.meta.icon" alt="nav-icon" />
      </router-link>
    </nav>
    <div class="bottom-header">
      <!-- Maybe will be use in a later version
      <img
        class="update"
        src="@/assets/icons/update.svg"
        alt="update-button"
      >
      -->
      <img
        class="question"
        src="@/assets/icons/question.svg"
        alt="update-button"
        @click="router.push('report')"
      />
      <div
        v-if="UserStore.player.username"
        class="user-icon"
        :style="{ backgroundColor: Utils.generateRandomColor() }"
      >
        <p>
          {{ UserStore.player.username.charAt(0).toUpperCase() }}
        </p>
      </div>
      <p>v{{ version }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { router, routes } from "@/router";
import { ref } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { Utils } from "@/objects/utils/Utils.ts";
import { useI18n } from "vue-i18n";

const version = ref(import.meta.env.VITE_VERSION);
const { t } = useI18n();
</script>

<style scoped lang="scss">
.nav-wrapper {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--secondary-background);
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;

  nav {
    display: flex;
    flex-direction: column;
    padding: 8px;
    align-items: center;
    gap: 24px;

    .router-link {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 24px;
    }

    svg {
      width: 40px;
    }

    .router-link-active {
      img {
        filter: invert(48%) sepia(70%) saturate(408%) hue-rotate(110deg)
          brightness(92%) contrast(98%);
      }
    }

    img {
      width: 32px;
      height: 32px;
    }
  }

  .bottom-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;

    p {
      justify-self: end;
      font-size: 9px;
      margin-bottom: 4px;
      color: var(--secondary-text);
    }

    .update {
      width: 24px;
    }

    .question {
      width: 20px;
      cursor: pointer;
    }

    .user-icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 6px;

      p {
        user-select: none;
        text-align: center;
        margin-top: 4px;
        font-size: 16px;
        color: white;
      }
    }
  }
}
</style>
