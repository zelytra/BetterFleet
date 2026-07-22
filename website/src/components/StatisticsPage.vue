<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
  AllianceStats,
  fetchAllianceStats,
  fetchRegions,
  RegionCount,
} from "@/objects/AllianceStats.ts";

// Lazy: globe.gl bundles three.js, so it stays out of the main bundle and loads only here.
const GlobeCard = defineAsyncComponent(
  () => import("@/components/GlobeCard.vue"),
);

// The public alliance-analytics dashboard (issue #673). Anonymous, aggregated data on how often
// crews converge onto one server, and when it works best.

const { t } = useI18n();

const stats = ref<AllianceStats | null>(null);
const regions = ref<RegionCount[]>([]);
const ownerRegion = ref<string>("");
const loading = ref(true);

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

    <p v-if="loading" class="muted">…</p>
    <p v-else-if="!hasData" class="muted empty">{{ t("alliance.empty") }}</p>

    <template v-else>
      <div class="tiles">
        <div class="tile">
          <h2>{{ stats!.totalAttempts }}</h2>
          <p>{{ t("alliance.tile.attempts") }}</p>
        </div>
        <div class="tile accent">
          <h2>{{ percentRate }}%</h2>
          <p>{{ t("alliance.tile.convergence") }}</p>
        </div>
        <div class="tile">
          <h2>{{ avgTries }}</h2>
          <p>{{ t("alliance.tile.tries") }}</p>
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
            <span class="region-fill" :style="{ width: r.width + '%' }"></span>
          </span>
          <span class="region-count">{{ r.attempts }}</span>
        </div>
      </div>
    </template>
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

  .region-name {
    font-weight: 700;
    font-size: 13px;
  }

  .region-bar {
    height: 12px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 6px;
    overflow: hidden;
  }

  .region-fill {
    display: block;
    height: 100%;
    background: var(--primary);
    border-radius: 6px;
  }

  .region-count {
    text-align: right;
    color: var(--secondary-text);
    font-variant-numeric: tabular-nums;
    font-size: 13px;
  }
}
</style>
