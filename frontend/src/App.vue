<template>
  <section class="app-section">
    <Header />
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </section>
  </section>
  <Loading :is-loading="false">
    <h1>{{ t('loading.targetGame') }}</h1>
  </Loading>
</template>

<script setup lang="ts">
import Header from "@/components/global/Header.vue";
import Loading from "@/vue/templates/Loading.vue";
import {useI18n} from "vue-i18n";

const {t} = useI18n();
</script>

<style scoped lang="scss">
.app-section{
  display: flex;

  .content{
    height: 100vh;
    overflow: hidden;
    overflow-y: auto;
    padding: 8px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }
}
</style>
