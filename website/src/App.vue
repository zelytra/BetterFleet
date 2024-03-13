<template>
  <Header/>
  <router-view v-slot="{ Component }">
    <transition mode="out-in">
      <component :is="Component"/>
    </transition>
  </router-view>
</template>

<script setup lang="ts">

import Header from "@/components/global/Header.vue";
import {onBeforeMount} from "vue";
import {AppStore} from "@/objects/stores/appStore.ts";

onBeforeMount(() => {
  AppStore.init()
})

</script>

<style scoped lang="scss">

</style>
