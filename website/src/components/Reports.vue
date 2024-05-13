<template>
  <section class="reports-wrapper">
    <FaqCollapse url="reports" v-for="report of reports" :id="report.id.toString()"
                 :title="'Report n°'+report.id + ' | '+report.reportingDate">
      <div class="content-wrapper">
        <p class="message">
          {{ report.message }}
        </p>
        <p class="logs">
          {{ report.logs }}
        </p>
        <p class="os">
          {{ report.device }}
        </p>
      </div>
    </FaqCollapse>
  </section>
</template>

<script setup lang="ts">

import FaqCollapse from "@/vue/FaqCollapse.vue";
import {onMounted, ref} from "vue";
import {ReportInterface} from "@/objects/BugReport.ts";
import {HTTPAxios} from "@/objects/HTTPAxios.ts";
import {AxiosResponse} from "axios";

const reports = ref<ReportInterface[]>([])

onMounted(() => {
  new HTTPAxios("report/list/all").get().then((response: AxiosResponse) => {
    reports.value = response.data as ReportInterface[]
  })
})
</script>

<style scoped lang="scss">
.reports-wrapper {
  margin: 90px auto;
  min-height: 500px;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 80vw;
  gap: 15px;

  .content-wrapper {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  p.logs, p.os {
    white-space: pre;
    font-family: "JetBrains Mono",sans-serif;
  }
}
</style>