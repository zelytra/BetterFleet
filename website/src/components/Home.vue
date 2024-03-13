<template>
  <div>
    <AppPresentation/>
    <Separator/>
    <Statistics/>
    <Separator/>
    <Descriptions/>
  </div>
</template>

<script setup lang="ts">

import AppPresentation from "@/components/home/AppPresentation.vue";
import Separator from "@/vue/Separator.vue";
import Statistics from "@/components/home/Statistics.vue";
import Descriptions from "@/components/home/Descriptions.vue";
</script>

<style scoped lang="scss">

</style>