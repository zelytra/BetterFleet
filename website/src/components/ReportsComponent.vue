<template>
  <section class="reports-wrapper">
    <!-- The row number is the report's rank in submission order, not its database id: Hibernate
         hands out ids from a sequence in blocks of 50, so raw ids jump after every backend restart
         and read like missing reports. Rank stays dense, and stays put as new reports arrive - the
         list is newest-first, so it counts down the page. -->
    <!-- The anchor uses the DATABASE id (#report-801), not the rank: the rank of a given report is
         stable, but the anchor has to survive being computed from a different page size, so shared
         links and the Discord webhook's quick access stay pointed at the same report forever. -->
    <FaqCollapse
      v-for="(report, index) of reports"
      :id="'report-' + report.id"
      :key="report.id"
      url="reports"
      :title="
        t('reports.entry', { number: rankOf(index) }) +
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

    <!-- The wait has its own box so the page does not jump when a page swaps in, and the ship
         inside it rides `showLoader`, so a warm response swaps the rows in without a flicker. -->
    <div v-if="loading" class="loading" aria-busy="true">
      <BoatLoader v-if="showLoader" :label="t('loading.reports')" :size="140" />
    </div>
    <p v-else-if="!reports.length" class="empty">{{ t("reports.empty") }}</p>

    <nav
      v-if="pageCount > 1"
      class="pager"
      :aria-label="t('reports.page', { page: page + 1, total: pageCount })"
    >
      <button
        type="button"
        :disabled="page === 0 || loading"
        @click="goTo(page - 1)"
      >
        {{ t("reports.previous") }}
      </button>
      <span class="position">{{
        t("reports.page", { page: page + 1, total: pageCount })
      }}</span>
      <button
        type="button"
        :disabled="page >= pageCount - 1 || loading"
        @click="goTo(page + 1)"
      >
        {{ t("reports.next") }}
      </button>
    </nav>
  </section>
</template>

<script setup lang="ts">
import FaqCollapse from "@/vue/FaqCollapse.vue";
import BoatLoader from "@/vue/BoatLoader.vue";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { formatReportDate, ReportInterface } from "@/objects/BugReport.ts";
import { HTTPAxios } from "@/objects/HTTPAxios.ts";
import { AxiosResponse } from "axios";
import { useDelayedLoading } from "@/objects/DelayedLoading.ts";

// The page used to pull /report/list/all: every report, with its full log capture, in one response -
// 7 MB for 44 reports, and growing with every submission. It now walks the paginated endpoint
// (#823), newest first, which is also the order a reader wants: the report someone just filed is
// the one being looked for.

const { t, locale } = useI18n();

/** Reports per page. Each one carries its whole log capture, so this is measured in megabytes. */
const PAGE_SIZE = 10;

const reports = ref<ReportInterface[]>([]);
const page = ref(0);
const total = ref(0);
const loading = ref(true);
const showLoader = useDelayedLoading(loading);

const pageCount = computed(() => Math.ceil(total.value / PAGE_SIZE) || 1);

interface ReportPage {
  items: ReportInterface[];
  page: number;
  amount: number;
  total: number;
}

/**
 * The rank shown on a row: reports are served newest first, so the top of page 1 is the highest
 * rank and it counts down from there. Derived from the total rather than the row position, which
 * keeps a given report's number the same on every page size - and stable as new reports arrive,
 * since a newcomer raises the total and its own rank, not anyone else's.
 */
function rankOf(index: number): number {
  return total.value - (page.value * PAGE_SIZE + index);
}

async function load(target: number) {
  loading.value = true;
  try {
    const response: AxiosResponse = await new HTTPAxios(
      `report/list/${target}/${PAGE_SIZE}`,
    ).get();
    const body = response.data as ReportPage;
    reports.value = body.items ?? [];
    total.value = body.total ?? 0;
    page.value = body.page ?? target;
  } catch (e) {
    console.error("[reports] could not load page " + target, e);
    reports.value = [];
  } finally {
    loading.value = false;
  }
}

async function goTo(target: number) {
  await load(target);
  // A page swap keeps the reader at the top of the list rather than wherever the previous page's
  // scroll left them, which on a long report is well past the pager.
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * The page holding the report a deep link points at, or null when the hash names no report.
 *
 * Shared links and the Discord webhook target a report by id (`/reports#report-801`), and with the
 * list paginated that report is usually not on the first page. The id cannot be turned into a
 * position client-side - ids come from a sequence in blocks of 50, so they are not contiguous - so
 * the backend answers it with one count.
 */
async function pageOfDeepLink(): Promise<number | null> {
  const match = /^#report-(\d+)$/.exec(window.location.hash);
  if (!match) return null;
  try {
    const response: AxiosResponse = await new HTTPAxios(
      `report/${match[1]}/position`,
    ).get();
    const position = Number((response.data as { position: number }).position);
    return Number.isFinite(position) ? Math.floor(position / PAGE_SIZE) : 0;
  } catch {
    // Unknown id, or the backend could not answer: fall back to the first page rather than showing
    // nothing. The collapse simply will not auto-open.
    return 0;
  }
}

/** Loads whichever page holds the report the current hash points at, if it is not already shown. */
async function followDeepLink() {
  const target = await pageOfDeepLink();
  // Only a hash that names a report moves the list. Clearing the hash, or any other anchor on the
  // page, must leave the reader on the page they are reading.
  if (target !== null && target !== page.value) await load(target);
}

onMounted(async () => {
  await load((await pageOfDeepLink()) ?? 0);
  // A link to a report on another page changes the hash without remounting anything - pasting a
  // shared link while already on /reports, or following the webhook's link from an open tab - so
  // the page has to be fetched again or the target simply is not in the list.
  window.addEventListener("hashchange", followDeepLink);
});

onUnmounted(() => window.removeEventListener("hashchange", followDeepLink));
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

  .loading {
    display: flex;
    justify-content: center;
    padding: 40px 0;
  }

  .empty {
    color: var(--secondary-text);
  }

  .pager {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-top: 10px;

    button {
      padding: 8px 18px;
      border-radius: 8px;
      border: 1px solid rgba(50, 212, 153, 0.35);
      background: rgba(50, 212, 153, 0.08);
      color: var(--primary);
      font-family: inherit;
      font-size: 14px;
      cursor: pointer;
      transition: background 0.15s ease;

      &:hover:not(:disabled) {
        background: rgba(50, 212, 153, 0.16);
      }

      &:disabled {
        opacity: 0.4;
        cursor: default;
      }
    }

    .position {
      color: var(--secondary-text);
      font-size: 14px;
    }
  }
}
</style>
