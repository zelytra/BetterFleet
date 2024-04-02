<template>
  <router-view v-slot="{ Component }">
    <transition mode="out-in">
      <component :is="Component"/>
    </transition>
  </router-view>
  <Loading :is-loading="false">
    <h1>{{ t("loading.targetGame") }}</h1>
  </Loading>
  <AlertComponent/>
</template>

<script setup lang="ts">
import Loading from "@/vue/templates/Loading.vue";
import AlertComponent from "@/vue/alert/AlertComponent.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n()
</script>

<style scoped lang="scss">

</style>
