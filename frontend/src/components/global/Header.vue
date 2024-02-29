<template>
  <div class="nav-wrapper">
    <nav>
      <router-link
        v-for="route in routes"
        :key="route.name"
        class="router-link"
        :to="route.path"
      >
        <img v-if="route.meta" :src="route.meta.icon" alt="nax-icon" />
      </router-link>
    </nav>
    <div class="bottom-header">
      <img class="update" src="@/assets/icons/update.svg" alt="update-button" />
      <div
        v-if="UserStore.player.username"
        class="user-icon"
        :style="{ backgroundColor: Utils.generateRandomColor() }"
      >
        <p>
          {{ UserStore.player.username.charAt(0) }}
        </p>
      </div>
      <p>v{{ version }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { routes } from "@/router";
import { ref } from "vue";
import { UserStore } from "../../objects/stores/UserStore.ts";
import { Utils } from "@/objects/Utils.ts";

const version = ref(import.meta.env.VITE_VERSION);
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
