<template>
  <section class="reports-wrapper">
    <!-- The row number is the report's position in the list, not its database id: Hibernate hands
         out ids from a sequence in blocks of 50, so raw ids jump after every backend restart and
         read like missing reports. Position stays dense, and stable as new reports are appended. -->
    <!-- The anchor uses the DATABASE id (#report-801), not the row number: the number shifts as
         reports are appended, the id never does, so shared links and the Discord webhook's quick
         access stay pointed at the same report forever. -->
    <FaqCollapse
      v-for="(report, index) of reports"
      :id="'report-' + report.id"
      :key="report.id"
      url="reports"
      :title="
        'Report n°' +
        (index + 1) +
        ' | ' +
        formatReportDate(report.reportingDate, locale) +
        (report.version ? ' | v' + report.version : '') +
        (report.username ? ' | ' + report.username : '')
      "
    >
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
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatReportDate, ReportInterface } from "@/objects/BugReport.ts";
import { HTTPAxios } from "@/objects/HTTPAxios.ts";
import { AxiosResponse } from "axios";

const { locale } = useI18n();
const reports = ref<ReportInterface[]>([]);

onMounted(() => {
  new HTTPAxios("report/list/all").get().then((response: AxiosResponse) => {
    // The endpoint has no ORDER BY, so pin insertion order here: the template numbers rows by
    // position, and that numbering must not reshuffle between two loads.
    reports.value = (response.data as ReportInterface[]).sort(
      (a, b) => a.id - b.id,
    );
  });
});
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
    user-select: text;
  }

  p {
    user-select: text;
  }

  p.logs,
  p.os {
    // pre-wrap, not pre: log lines keep their line breaks but still wrap, instead of one long
    // line dragging the whole page sideways (#670).
    white-space: pre-wrap;
    word-break: break-word;
    font-family: "JetBrains Mono", sans-serif;
  }
}
</style>
