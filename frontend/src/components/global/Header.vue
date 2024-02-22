<template>
  <div class="nav-wrapper">
    <nav>
      <router-link
        v-for="route in routes"
        :key="route.name"
        class="router-link"
        :to="route.path"
      > 
        <img
          v-if="route.meta"
          :src="route.meta.icon"
          alt="nax-icon"
        >
      </router-link>
    </nav>
    <div class="bottom-header">
      <img
        src="@/assets/icons/update.svg"
        alt="update-button"
      >
      <p>v{{ version }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">

import {routes} from "@/router";
import {ref} from "vue";

const version = ref(import.meta.env.VITE_VERSION)
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

  nav{
    display: flex;
    flex-direction: column;
    padding: 8px;
    align-items: center;
    gap: 24px;

    img {
      width: 28px;
      height: 28px;
    }
  }

  .bottom-header{
    display: flex;
    flex-direction: column;
  align-items: center;
    gap: 24px;
    p{
      justify-self: end;
      font-size: 12px;
      margin-bottom: 4px;
      color: var(--secondary-text);
    }
  }




}
</style>