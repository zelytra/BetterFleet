<template>
  <div>
    <AppPresentation/>
    <Separator/>
    <Statistics/>
    <Separator/>
    <Descriptions/>
    <Separator/>
    <Discover/>
    <Separator/>
    <Comparaison/>
    <Separator/>
    <Download/>
  </div>
</template>

<script setup lang="ts">

import AppPresentation from "@/components/home/AppPresentation.vue";
import Separator from "@/vue/Separator.vue";
import Statistics from "@/components/home/Statistics.vue";
import Descriptions from "@/components/home/Descriptions.vue";
import Comparaison from "@/components/home/Comparison.vue";
import Discover from "@/components/home/Discover.vue";
import FooterVue from "@/components/global/FooterVue.vue";
import Download from "@/components/home/Download.vue";
</script>

<style scoped lang="scss">

</style>