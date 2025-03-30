<template>
  <div>
    <AppPresentation />
    <SeparatorVue />
    <StatisticsComponent />
    <SeparatorVue />
    <DescriptionsComponent />
    <SeparatorVue />
    <DiscoverComponent />
    <SeparatorVue />
    <ComparisonComponent />
    <SeparatorVue />
    <DownloadComponent />
  </div>
</template>

<script setup lang="ts">
import AppPresentation from "@/components/home/AppPresentation.vue";
import SeparatorVue from "@/vue/SeparatorVue.vue";
import StatisticsComponent from "@/components/home/StatisticsComponent.vue";
import DescriptionsComponent from "@/components/home/DescriptionsComponent.vue";
import ComparisonComponent from "@/components/home/ComparisonComponent.vue";
import DiscoverComponent from "@/components/home/DiscoverComponent.vue";
import DownloadComponent from "@/components/home/DownloadComponent.vue";
</script>

<style scoped lang="scss"></style>
