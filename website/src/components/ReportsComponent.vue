<template>
  <section class="reports-wrapper">
    <!-- The row number is the report's rank in submission order, not its database id: Hibernate
         hands out ids from a sequence in blocks of 50, so raw ids jump after every backend restart
         and read like missing reports. Rank stays dense, and stays put as new reports arrive - the
         list is newest-first, so it counts down the page. -->
    <!-- The anchor uses the DATABASE id (#report-801), not the rank: the rank of a given report is
         stable, but the anchor has to survive being computed from a different page size, so shared
         links and the Discord webhook's quick access stay pointed at the same report forever. -->
    <div class="rows" :class="{ swapping: loading && reports.length > 0 }">
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
    </div>

    <!-- The ship only takes over when there is nothing to keep on screen (the first load). A page
         turn leaves the previous rows in place, dimmed and aria-busy, so the list swaps rather than
         collapsing to a loader and back - which is the jump this box used to cause. -->
    <div v-if="loading && !reports.length" class="loading" aria-busy="true">
      <BoatLoader v-if="showLoader" :label="t('loading.reports')" :size="140" />
    </div>
    <p v-else-if="failed" class="empty" role="alert">
      {{ t("reports.error") }}
    </p>
    <p v-else-if="!loading && !reports.length" class="empty">
      {{ t("reports.empty") }}
    </p>

    <nav
      v-if="pageCount > 1"
      class="pager"
      :aria-label="t('reports.pagination')"
    >
      <button
        type="button"
        :disabled="page === 0 || loading"
        @click="goTo(page - 1)"
      >
        {{ t("reports.previous") }}
      </button>
      <!-- Focus lands here after a page turn: the button that was clicked can become disabled on
           the first or last page, which would otherwise drop keyboard focus to <body>. It doubles
           as the live region announcing the swap. -->
      <span
        ref="position"
        class="position"
        tabindex="-1"
        role="status"
        aria-live="polite"
        >{{ t("reports.page", { page: page + 1, total: pageCount }) }}</span
      >
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
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
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
const failed = ref(false);
const showLoader = useDelayedLoading(loading);
const position = ref<HTMLElement | null>(null);

// Only the newest request may write the state. Two quick page turns, or a deep link arriving while
// a page is in flight, otherwise race: the slower response lands last and the reader ends up on a
// page the pager no longer claims.
let latestRequest = 0;

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
  const ticket = ++latestRequest;
  loading.value = true;
  failed.value = false;
  try {
    const response: AxiosResponse = await new HTTPAxios(
      `report/list/${target}/${PAGE_SIZE}`,
    ).get();
    if (ticket !== latestRequest) return;
    const body = response.data as ReportPage;
    reports.value = body.items ?? [];
    total.value = body.total ?? 0;
    page.value = body.page ?? target;
  } catch (e) {
    if (ticket !== latestRequest) return;
    console.error("[reports] could not load page " + target, e);
    // Distinct from "no reports yet": telling a reader the list is empty when the request failed
    // sends them away from a page that is merely offline.
    failed.value = true;
    reports.value = [];
  } finally {
    if (ticket === latestRequest) loading.value = false;
  }
}

async function goTo(target: number) {
  await load(target);
  await nextTick();
  // Keyboard focus would otherwise fall to <body>: reaching the first or last page disables the
  // button that was just pressed. The status text takes it instead, which is also what a screen
  // reader announces.
  position.value?.focus();
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

onMounted(() => {
  // Registered before the first await, not after it: a listener added late is both deaf to a hash
  // change during the initial load and, if the visitor leaves in that window, never removed - the
  // unmount hook would run first and take nothing off.
  //
  // A link to a report on another page changes the hash without remounting anything - pasting a
  // shared link while already on /reports, or following the webhook's link from an open tab - so
  // the page has to be fetched again or the target simply is not in the list.
  window.addEventListener("hashchange", followDeepLink);
  void (async () => load((await pageOfDeepLink()) ?? 0))();
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

  .rows {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    width: 100%;
    transition: opacity 0.15s ease;

    // A page in flight keeps its predecessor on screen, faded: the list swaps in place instead of
    // collapsing to a loader and pushing the pager up the page.
    &.swapping {
      opacity: 0.45;
    }
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
