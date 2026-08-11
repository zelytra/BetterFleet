<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { fetchStatsHistory, Stats } from "@/objects/Stats.ts";
import { type RangeId, sliceLastDays } from "@/objects/ChartRange.ts";
import RangePicker from "@/vue/RangePicker.vue";

// Downloads over time, one point per UTC day, drawn as a hand-rolled SVG area chart - the page has
// no chart library on purpose (the heatmap and region bars are plain CSS too) and one series needs
// none. The card fetches for itself and simply stays off the page until it has at least two days,
// so it neither blocks nor flickers the alliance dashboard above it, and the region filter's
// reloads never touch it.

const { t, locale } = useI18n();

const rows = ref<Stats[]>([]);

onMounted(async () => {
  try {
    rows.value = await fetchStatsHistory();
  } catch {
    rows.value = []; // unreachable backend: the card just stays hidden
  }
});

// The drawing area. Everything is computed in this fixed viewBox and the SVG scales to the card;
// vector-effect keeps the strokes 2px on screen whatever the scale.
const W = 720;
const H = 240;
const M = { top: 12, right: 14, bottom: 28, left: 46 };
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One value per day from the first recorded day to the last, zero-filled. The backend only creates
 * a row the first time something happens on a day, so a silent day is a missing row - and a chart
 * that skips it would splice time and hide the very dips a release chart is read for.
 */
const allDays = computed<{ date: Date; count: number }[]>(() => {
  if (rows.value.length === 0) return [];
  const byDay = new Map<number, number>();
  for (const row of rows.value) {
    byDay.set(row.date.getTime(), row.download);
  }
  const first = rows.value[0].date.getTime();
  const last = rows.value[rows.value.length - 1].date.getTime();
  const filled: { date: Date; count: number }[] = [];
  for (let ts = first; ts <= last; ts += DAY_MS) {
    filled.push({ date: new Date(ts), count: byDay.get(ts) ?? 0 });
  }
  return filled;
});

// The displayed window (ChartRange.ts holds the shared windows and slicing rule; RangePicker the
// pills). The card's own visibility stays keyed on the full series, so switching to a window can
// never blank the card it lives in.
const selectedRange = ref<RangeId>("all");

const days = computed(() => sliceLastDays(allDays.value, selectedRange.value));

// Sum over the DISPLAYED window, so the headline always agrees with the curve under it.
const total = computed(() =>
  days.value.reduce((sum, day) => sum + day.count, 0),
);

// Y ceiling snapped to 1/2/5 x 10^k, so gridline labels land on round numbers.
const yMax = computed(() => {
  const max = Math.max(1, ...days.value.map((d) => d.count));
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 2, 5, 10]) {
    if (max <= step * power) return step * power;
  }
  return 10 * power;
});

function x(index: number): number {
  const span = Math.max(1, days.value.length - 1);
  return M.left + (index / span) * (W - M.left - M.right);
}

function y(count: number): number {
  return H - M.bottom - (count / yMax.value) * (H - M.top - M.bottom);
}

const linePath = computed(() =>
  days.value
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(d.count).toFixed(2)}`,
    )
    .join(" "),
);

const areaPath = computed(() => {
  if (days.value.length === 0) return "";
  const baseline = H - M.bottom;
  return `${linePath.value} L${x(days.value.length - 1).toFixed(2)},${baseline} L${x(0).toFixed(2)},${baseline} Z`;
});

// Four horizontal gridlines (quarters of a round ceiling); 0 stays the unlabeled baseline.
const yTicks = computed(() =>
  [0.25, 0.5, 0.75, 1].map((f) => ({
    value: Math.round(yMax.value * f),
    y: y(yMax.value * f),
  })),
);

// Up to five date ticks, first and last always included so the covered range reads at a glance.
const xTicks = computed(() => {
  const count = days.value.length;
  if (count < 2) return [];
  const tickCount = Math.min(5, count);
  // timeZone UTC on purpose: the rows are UTC days, and local-time formatting would shift every
  // label a day back for viewers west of Greenwich.
  const format = new Intl.DateTimeFormat(locale.value, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return Array.from({ length: tickCount }, (_, i) => {
    const index = Math.round((i / (tickCount - 1)) * (count - 1));
    return { x: x(index), label: format.format(days.value[index].date) };
  });
});

const totalLabel = computed(() =>
  t("downloads.total", {
    count: new Intl.NumberFormat(locale.value).format(total.value),
  }),
);

// Hover: nearest day snapping, one crosshair + dot + tooltip. Pointer position is mapped from CSS
// pixels back into viewBox units since the SVG scales with the card.
const hovered = ref<number | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);

// A hovered index belongs to the previous window's geometry; drop it on a switch rather than let
// it point at the wrong (or a missing) day for one frame.
watch(selectedRange, () => (hovered.value = null));

function onMove(event: MouseEvent) {
  if (!svgEl.value || days.value.length < 2) return;
  const rect = svgEl.value.getBoundingClientRect();
  const viewX = ((event.clientX - rect.left) / rect.width) * W;
  const span = W - M.left - M.right;
  const ratio = Math.min(1, Math.max(0, (viewX - M.left) / span));
  hovered.value = Math.round(ratio * (days.value.length - 1));
}

const tooltip = computed(() => {
  if (hovered.value === null) return null;
  const day = days.value[hovered.value];
  if (!day) return null;
  const format = new Intl.DateTimeFormat(locale.value, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC", // UTC days, as on the axis
  });
  return {
    x: x(hovered.value),
    y: y(day.count),
    date: format.format(day.date),
    count: t("downloads.tooltipCount", {
      count: new Intl.NumberFormat(locale.value).format(day.count),
    }),
    // Flip the HTML tooltip to the other side of the crosshair near the right edge.
    flip: x(hovered.value) > W * 0.72,
  };
});

const ariaLabel = computed(
  () => `${t("downloads.title")} — ${totalLabel.value}`,
);
</script>

<template>
  <div v-if="allDays.length >= 2" class="card downloads-card">
    <div class="head">
      <h3>{{ t("downloads.title") }}</h3>
      <span class="total">{{ totalLabel }}</span>
    </div>
    <p class="muted note">{{ t("downloads.note") }}</p>

    <RangePicker v-model="selectedRange" />

    <div class="chart-scroll">
      <div class="chart-wrap">
        <svg
          ref="svgEl"
          :viewBox="`0 0 ${W} ${H}`"
          role="img"
          :aria-label="ariaLabel"
          @mousemove="onMove"
          @mouseleave="hovered = null"
        >
          <!-- Recessive grid: quarter lines of a round ceiling, labels in the left gutter. -->
          <g v-for="tick in yTicks" :key="tick.value">
            <line
              :x1="M.left"
              :x2="W - M.right"
              :y1="tick.y"
              :y2="tick.y"
              class="grid"
              vector-effect="non-scaling-stroke"
            />
            <text :x="M.left - 8" :y="tick.y + 3.5" class="tick y">
              {{ tick.value }}
            </text>
          </g>
          <line
            :x1="M.left"
            :x2="W - M.right"
            :y1="H - M.bottom"
            :y2="H - M.bottom"
            class="axis"
            vector-effect="non-scaling-stroke"
          />
          <text
            v-for="tick in xTicks"
            :key="tick.x"
            :x="tick.x"
            :y="H - M.bottom + 18"
            class="tick x"
          >
            {{ tick.label }}
          </text>

          <path :d="areaPath" class="area" />
          <path :d="linePath" class="line" vector-effect="non-scaling-stroke" />

          <template v-if="tooltip">
            <line
              :x1="tooltip.x"
              :x2="tooltip.x"
              :y1="M.top"
              :y2="H - M.bottom"
              class="crosshair"
              vector-effect="non-scaling-stroke"
            />
            <!-- The hovered day's dot, ringed with the card surface so it pops off the line. -->
            <circle :cx="tooltip.x" :cy="tooltip.y" r="4.5" class="dot" />
          </template>
        </svg>

        <div
          v-if="tooltip"
          class="tooltip"
          :class="{ flip: tooltip.flip }"
          :style="{ left: (tooltip.x / W) * 100 + '%' }"
        >
          <span class="date">{{ tooltip.date }}</span>
          <span class="count">{{ tooltip.count }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.downloads-card {
  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;

    h3 {
      margin: 0;
    }

    .total {
      color: var(--primary);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }

  .note {
    text-align: left;
    font-size: 14px;
    margin-bottom: 12px;
  }

  .muted {
    color: var(--secondary-text);
  }

  // Same policy as the heatmap: on a phone the chart keeps a readable width and scrolls sideways
  // instead of crushing its labels.
  .chart-scroll {
    overflow-x: auto;
  }

  .chart-wrap {
    position: relative;
    min-width: 560px;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
  }

  .grid {
    stroke: rgba(255, 255, 255, 0.07);
    stroke-width: 1;
  }

  .axis {
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 1;
  }

  .tick {
    fill: var(--secondary-text);
    font-size: 11px;

    &.y {
      text-anchor: end;
    }

    &.x {
      text-anchor: middle;
    }
  }

  .area {
    fill: var(--primary);
    opacity: 0.12;
  }

  .line {
    fill: none;
    stroke: var(--primary);
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  .crosshair {
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .dot {
    fill: var(--primary);
    stroke: var(--secondary-background);
    stroke-width: 2;
  }

  .tooltip {
    position: absolute;
    top: 6px;
    transform: translateX(10px);
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: var(--primary-background);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    padding: 8px 10px;
    pointer-events: none;
    white-space: nowrap;
    font-size: 12px;

    &.flip {
      transform: translateX(calc(-100% - 10px));
    }

    .date {
      color: var(--secondary-text);
    }

    .count {
      color: var(--primary-text);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
