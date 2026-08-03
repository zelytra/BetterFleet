<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  AllianceStats,
  fetchAllianceStats,
  fetchRegions,
  RegionCount,
} from "@/objects/AllianceStats.ts";
import { useDelayedLoading } from "@/objects/DelayedLoading.ts";
import BoatLoader from "@/vue/BoatLoader.vue";
import GlobeLoading from "@/vue/GlobeLoading.vue";

// Lazy: globe.gl bundles three.js, so it stays out of the main bundle and loads only here. It is
// ~575 KB gzipped, so on anything but a fast connection the wait is long enough to need saying —
// but `delay` still keeps the ship off the screen when the chunk comes from cache.
const GlobeCard = defineAsyncComponent({
  loader: () => import("@/components/GlobeCard.vue"),
  loadingComponent: GlobeLoading,
  delay: 400,
});

// The public alliance-analytics dashboard (issue #673). Anonymous, aggregated data on how often
// crews converge onto one server, and when it works best.

const { t } = useI18n();

const stats = ref<AllianceStats | null>(null);
const regions = ref<RegionCount[]>([]);
const ownerRegion = ref<string>("");
const loading = ref(true);
const showLoader = useDelayedLoading(loading);

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

async function load() {
  loading.value = true;
  try {
    stats.value = await fetchAllianceStats(ownerRegion.value || undefined);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  try {
    regions.value = await fetchRegions();
  } catch {
    regions.value = [];
  }
  await load();
});

// day (1-7) + hour (0-23) -> cell, for O(1) lookup while rendering the grid.
const cellMap = computed(() => {
  const map = new Map<string, { attempts: number; rate: number }>();
  for (const c of stats.value?.heatmap ?? []) {
    map.set(`${c.dayOfWeek}-${c.hour}`, { attempts: c.attempts, rate: c.rate });
  }
  return map;
});

function cellStyle(day: number, hour: number) {
  const cell = cellMap.value.get(`${day}-${hour}`);
  if (!cell || cell.attempts === 0) {
    return { background: "var(--secondary-background)", opacity: "0.35" };
  }
  // Rate 0..1 → red (0°) to green (120°). Dim cells with too few samples.
  const hue = Math.round(cell.rate * 120);
  const enough = cell.attempts >= 5;
  return {
    background: `hsl(${hue}, 62%, 45%)`,
    opacity: enough ? "1" : "0.5",
  };
}

function cellTitle(day: number, hour: number) {
  const cell = cellMap.value.get(`${day}-${hour}`);
  const label = `${DAYS[day - 1]} ${String(hour).padStart(2, "0")}:00 UTC`;
  if (!cell || cell.attempts === 0) return `${label} — no data`;
  return `${label} — ${Math.round(cell.rate * 100)}% converged (${cell.attempts} attempts)`;
}

const percentRate = computed(() =>
  stats.value ? Math.round(stats.value.convergenceRate * 100) : 0,
);
const avgTries = computed(() =>
  stats.value ? stats.value.averageTries.toFixed(1) : "—",
);

const bestHoursLabel = computed(() => {
  const hours = stats.value?.bestHours ?? [];
  if (!hours.length) return t("alliance.bestTimeNone");
  return (
    hours.map((h) => `${String(h).padStart(2, "0")}:00`).join(", ") + " UTC"
  );
});

// Region bars: top owner regions by attempts, width relative to the busiest.
const topRegions = computed(() => {
  const max = regions.value[0]?.attempts ?? 1;
  return regions.value.slice(0, 12).map((r) => ({
    region: r.region.toUpperCase(),
    attempts: r.attempts,
    width: Math.max(4, Math.round((r.attempts / max) * 100)),
  }));
});

const percentGoal = computed(() =>
  stats.value ? Math.round(stats.value.goalCompletion * 100) : 0,
);

// Per-size rows (#720). Bands with nothing in them are dropped rather than shown as a row of dashes.
const sizeBands = computed(() =>
  (stats.value?.bySize ?? [])
    .filter((b) => b.attempts > 0)
    .map((b) => ({
      band: b.band,
      attempts: b.attempts,
      convergence: Math.round(b.convergenceRate * 100),
      goal: Math.round(b.goalCompletion * 100),
    })),
);

const hasData = computed(() => (stats.value?.totalAttempts ?? 0) > 0);
</script>

<template>
  <section class="stats-page">
    <header>
      <h1>{{ t("alliance.title") }}</h1>
      <p class="subtitle">{{ t("alliance.subtitle") }}</p>
    </header>

    <div class="controls">
      <label>
        {{ t("alliance.region.label") }}
        <select v-model="ownerRegion" @change="load()">
          <option value="">{{ t("alliance.region.all") }}</option>
          <option v-for="r in regions" :key="r.region" :value="r.region">
            {{ r.region.toUpperCase() }} ({{ r.attempts }})
          </option>
        </select>
      </label>
    </div>

    <!-- The dashboard's own wait. The box is here for as long as the request is, so the page never
         jumps; the ship inside it waits on `showLoader`, so a warm response — most of them — swaps
         the figures in silently rather than blinking a ship between two states. The region filter
         re-runs this, which is what would otherwise put that flicker one click away. -->
    <div class="swap-area">
      <transition name="swap">
        <div v-if="loading" key="loading" class="loading" aria-busy="true">
          <BoatLoader
            v-if="showLoader"
            :label="t('loading.stats')"
            :size="150"
          />
        </div>
        <p v-else-if="!hasData" key="empty" class="muted empty">
          {{ t("alliance.empty") }}
        </p>

        <div v-else key="content" class="content">
          <div class="tiles">
            <div class="tile">
              <h2>{{ stats!.totalAttempts }}</h2>
              <p>{{ t("alliance.tile.attempts") }}</p>
            </div>
            <div class="tile accent">
              <h2>{{ percentRate }}%</h2>
              <p>{{ t("alliance.tile.convergence") }}</p>
            </div>
            <div class="tile accent">
              <h2>{{ percentGoal }}%</h2>
              <p>{{ t("alliance.tile.goal") }}</p>
            </div>
            <div class="tile">
              <h2>{{ avgTries }}</h2>
              <p>{{ t("alliance.tile.tries") }}</p>
            </div>
          </div>

          <!-- Per search size (#720): "two ships met" is far easier to clear with more boats in the
           draw, and a big search is usually after five, not two — so one rate over all sizes
           flatters the large ones. Each band is scored against what it could actually reach. -->
          <div v-if="sizeBands.length" class="card size-card">
            <h3>{{ t("alliance.size.title") }}</h3>
            <p class="muted note">{{ t("alliance.size.note") }}</p>
            <div class="size-table">
              <div class="row head">
                <span>{{ t("alliance.size.band") }}</span>
                <span>{{ t("alliance.size.attempts") }}</span>
                <span>{{ t("alliance.tile.convergence") }}</span>
                <span>{{ t("alliance.tile.goal") }}</span>
              </div>
              <div v-for="row in sizeBands" :key="row.band" class="row">
                <span class="band">{{ row.band }}</span>
                <span>{{ row.attempts }}</span>
                <span>{{ row.convergence }}%</span>
                <span class="goal">{{ row.goal }}%</span>
              </div>
            </div>
          </div>

          <div class="best-time">
            <span class="label">🕑 {{ t("alliance.bestTime") }}</span>
            <span class="value">{{ bestHoursLabel }}</span>
          </div>

          <div class="card heatmap-card">
            <h3>{{ t("alliance.heatmap.title") }}</h3>
            <div class="heatmap">
              <div class="hour-axis">
                <span></span>
                <span v-for="h in HOURS" :key="h" class="hour-label">
                  {{ h % 3 === 0 ? h : "" }}
                </span>
              </div>
              <div v-for="(day, di) in DAYS" :key="day" class="heat-row">
                <span class="day-label">{{ day }}</span>
                <span
                  v-for="h in HOURS"
                  :key="h"
                  class="heat-cell"
                  :style="cellStyle(di + 1, h)"
                  :title="cellTitle(di + 1, h)"
                ></span>
              </div>
            </div>
            <div class="legend">
              <span>{{ t("alliance.heatmap.low") }}</span>
              <span class="scale"></span>
              <span>{{ t("alliance.heatmap.high") }}</span>
            </div>
          </div>

          <div v-if="topRegions.length" class="card regions-card">
            <h3>{{ t("alliance.regions.title") }}</h3>
            <GlobeCard :regions="regions" />
            <div v-for="r in topRegions" :key="r.region" class="region-row">
              <span class="region-name">{{ r.region }}</span>
              <span class="region-bar">
                <span
                  class="region-fill"
                  :style="{ width: r.width + '%' }"
                ></span>
              </span>
              <span class="region-count">{{ r.attempts }}</span>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </section>
</template>

<style scoped lang="scss">
.stats-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 60px 20px 100px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

header {
  text-align: center;

  h1 {
    font-family: BrushTip, sans-serif;
    font-size: 56px;
  }

  .subtitle {
    color: var(--secondary-text);
    max-width: 620px;
    margin: 8px auto 0;
  }
}

.controls {
  display: flex;
  justify-content: center;

  label {
    color: var(--secondary-text);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  select {
    background: var(--secondary-background);
    color: var(--primary-text);
    border: 1px solid var(--primary-border);
    border-radius: 8px;
    padding: 8px 12px;
  }
}

.muted {
  text-align: center;
  color: var(--secondary-text);

  &.empty {
    padding: 60px 0;
  }
}

// Held at the height the ship will need, from the first paint: the box exists for the whole request
// while the ship only appears at 400ms, and a box that grew at that moment would be the very jump
// the delay is there to avoid.
.loading {
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}

// The dashboard's three states — waiting, empty, loaded — cross-fade rather than cut.
//
// A true cross-fade, not `mode="out-in"`. Mounting this dashboard costs ~370ms of main thread (168
// heatmap cells, the tables, the globe's container), and out-in waits for the ship to leave before
// paying it — measured, that left the page blank for 440ms, which is worse than the cut it replaced.
// Here the two states share one grid cell, so the ship is still on screen, fading, while the
// dashboard paints underneath it. The leave is the slower of the two for that reason.
.swap-area {
  display: grid;
  // The single overlaid column has to track the container, not the content. Left as the implicit
  // `auto` track it grew to the dashboard's max-content width (~850px, driven by the globe and the
  // wide tables) and overflowed every viewport narrower than that — on tablet and phone the tiles,
  // heatmap and tables spilled off the right edge, clipped with no scrollbar to reach them. The
  // desktop full width hid it behind the page's own max-width. minmax(0, …) binds the column to the
  // available width and lets it shrink, so the inner overflow-x:auto scrollers take over as intended.
  grid-template-columns: minmax(0, 1fr);

  > * {
    grid-area: 1 / 1;
    min-width: 0; // let the overlaid states shrink to the column instead of forcing it wide
  }
}

.swap-enter-active {
  transition: opacity 280ms ease;
}

// On top as it goes, so it fades away to reveal the dashboard rather than showing through its gaps.
.swap-leave-active {
  transition: opacity 400ms ease;
  z-index: 2;
}

.swap-enter-from,
.swap-leave-to {
  opacity: 0;
}

// The wrapper the transition needs. It carries the column the page used to lay out directly, so the
// spacing between the dashboard's cards is unchanged.
.content {
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.tiles {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;

  .tile {
    background: var(--secondary-background);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-radius: 14px;
    padding: 24px;
    text-align: center;

    h2 {
      font-size: 40px;
      color: var(--primary-text);
    }

    &.accent h2 {
      color: var(--primary);
    }

    p {
      color: var(--secondary-text);
      margin-top: 4px;
    }
  }
}

.best-time {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  text-align: center;
  gap: 12px;
  background: rgba(50, 212, 153, 0.1);
  border: 1px solid rgba(50, 212, 153, 0.35);
  border-radius: 12px;
  padding: 16px;

  .value {
    color: var(--primary);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
}

.card {
  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  h3 {
    margin-bottom: 16px;
  }
}

.size-card {
  .note {
    margin: -8px 0 16px;
    font-size: 14px;
  }

  .size-table {
    // The four columns stay readable on a phone by scrolling rather than crushing.
    overflow-x: auto;

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr 1fr;
      gap: 8px;
      padding: 10px 4px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.06);
      min-width: 380px;
      font-variant-numeric: tabular-nums;

      &:last-child {
        border-bottom: none;
      }

      &.head {
        font-size: 13px;
        color: var(--secondary-text);
        border-bottom: 1px solid rgba(255, 255, 255, 0.18);
      }

      .band {
        color: var(--primary-text);
      }

      .goal {
        color: var(--primary);
      }
    }
  }
}

.heatmap {
  overflow-x: auto;

  .hour-axis,
  .heat-row {
    display: grid;
    grid-template-columns: 40px repeat(24, 1fr);
    gap: 3px;
    align-items: center;
    min-width: 560px;
  }

  .hour-axis {
    margin-bottom: 4px;

    .hour-label {
      font-size: 10px;
      color: var(--secondary-text);
      text-align: center;
    }
  }

  .heat-row {
    margin-bottom: 3px;
  }

  .day-label {
    font-size: 11px;
    color: var(--secondary-text);
  }

  .heat-cell {
    aspect-ratio: 1;
    border-radius: 3px;
    min-height: 16px;
  }
}

.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 12px;
  font-size: 12px;
  color: var(--secondary-text);

  .scale {
    width: 120px;
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(
      90deg,
      hsl(0, 62%, 45%),
      hsl(60, 62%, 45%),
      hsl(120, 62%, 45%)
    );
  }
}

.region-row {
  display: grid;
  grid-template-columns: 40px 1fr 50px;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.region-row .region-name {
  font-weight: 700;
  font-size: 13px;
}

.region-row .region-bar {
  height: 12px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  overflow: hidden;
}

.region-row .region-fill {
  display: block;
  height: 100%;
  background: var(--primary);
  border-radius: 6px;
}

.region-row .region-count {
  text-align: right;
  color: var(--secondary-text);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
}

// Phone: the three stat tiles stack, and the display type steps down to keep whole words on a line.
@media (max-width: $palm) {
  header h1 {
    font-size: 40px;
  }

  .tiles {
    grid-template-columns: 1fr;
  }
}
</style>
