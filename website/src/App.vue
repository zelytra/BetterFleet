<template>
  <Header/>
  <router-view v-slot="{ Component }">
    <transition mode="out-in">
      <component :is="Component"/>
    </transition>
  </router-view>
  <FooterVue/>
</template>

<script setup lang="ts">

import Header from "@/components/global/HeaderVue.vue";
import {onBeforeMount} from "vue";
import {AppStore} from "@/objects/stores/appStore.ts";
import FooterVue from "@/components/global/FooterVue.vue";

onBeforeMount(() => {
  AppStore.init()
})

</script>

<style scoped lang="scss">

</style>
