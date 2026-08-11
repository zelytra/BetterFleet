<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { fetchStatsHistory, Stats } from "@/objects/Stats.ts";

// Usage over time: fleet sessions opened and set-sail tries per UTC day, the two other series
// /stats/history has always carried but nothing charted. Same hand-rolled SVG pattern as
// DownloadsCard (which documents the shared choices: self-fetching, hidden until two days exist,
// zero-filled days, UTC-pinned axes). Both series count events per day, so they share ONE axis -
// never a second scale. The ratio between them is the headline: how many synchronized launches a
// session is worth.

const { t, locale } = useI18n();

const rows = ref<Stats[]>([]);

onMounted(async () => {
  try {
    rows.value = await fetchStatsHistory();
  } catch {
    rows.value = []; // unreachable backend: the card just stays hidden
  }
});

const W = 720;
const H = 240;
const M = { top: 14, right: 14, bottom: 28, left: 52 };
const DAY_MS = 24 * 60 * 60 * 1000;

interface Day {
  date: Date;
  sessions: number;
  tries: number;
}

// One value per day, zero-filled, for the same reason as the downloads chart: a silent day is a
// missing row, and skipping it would splice time.
const days = computed<Day[]>(() => {
  if (rows.value.length === 0) return [];
  const byDay = new Map<number, { sessions: number; tries: number }>();
  for (const row of rows.value) {
    byDay.set(row.date.getTime(), {
      sessions: row.sessionsOpen,
      tries: row.sessionTry,
    });
  }
  const first = rows.value[0].date.getTime();
  const last = rows.value[rows.value.length - 1].date.getTime();
  const filled: Day[] = [];
  for (let ts = first; ts <= last; ts += DAY_MS) {
    const value = byDay.get(ts);
    filled.push({
      date: new Date(ts),
      sessions: value?.sessions ?? 0,
      tries: value?.tries ?? 0,
    });
  }
  return filled;
});

const totalSessions = computed(() =>
  rows.value.reduce((sum, row) => sum + row.sessionsOpen, 0),
);
const totalTries = computed(() =>
  rows.value.reduce((sum, row) => sum + row.sessionTry, 0),
);

// The one number the two curves make together: set-sail tries per session opened.
const perSessionLabel = computed(() => {
  if (totalSessions.value === 0) return "";
  const ratio = totalTries.value / totalSessions.value;
  return t("activity.perSession", {
    count: new Intl.NumberFormat(locale.value, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(ratio),
  });
});

// One shared ceiling over both series. A denser ladder than the downloads chart's 1/2/5: the
// tries series spikes on release days (a burst of launches just over a round number), and 1/2/5
// would answer a 5 200 peak with a 10 000 ceiling that parks both curves in the bottom half.
const yMax = computed(() => {
  const max = Math.max(
    1,
    ...days.value.map((d) => Math.max(d.sessions, d.tries)),
  );
  const power = Math.pow(10, Math.floor(Math.log10(max)));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
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

function linePath(pick: (d: Day) => number): string {
  return days.value
    .map(
      (d, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(pick(d)).toFixed(2)}`,
    )
    .join(" ");
}

const sessionsPath = computed(() => linePath((d) => d.sessions));
const triesPath = computed(() => linePath((d) => d.tries));

// Direct labels at each line's end (text in text color; the line underneath carries the identity).
// Anchored to the right edge and nudged apart when the two ends run close.
const endLabels = computed(() => {
  const last = days.value.length - 1;
  if (last < 1) return [];
  const labels = [
    { key: "tries", y: y(days.value[last].tries) - 7 },
    { key: "sessions", y: y(days.value[last].sessions) - 7 },
  ];
  if (Math.abs(labels[0].y - labels[1].y) < 14) {
    // The lower of the two drops below its line end instead of colliding.
    const lower = labels[0].y > labels[1].y ? labels[0] : labels[1];
    lower.y += 21;
  }
  return labels.map((l) => ({
    ...l,
    y: Math.min(H - M.bottom - 4, Math.max(M.top + 8, l.y)),
  }));
});

const yTicks = computed(() =>
  [0.25, 0.5, 0.75, 1].map((f) => ({
    value: Math.round(yMax.value * f),
    y: y(yMax.value * f),
  })),
);

// Up to five date ticks, UTC-pinned like the rows themselves (see DownloadsCard).
const xTicks = computed(() => {
  const count = days.value.length;
  if (count < 2) return [];
  const tickCount = Math.min(5, count);
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

// Hover: nearest day snapping, one crosshair, a dot per series, one tooltip listing both.
const hovered = ref<number | null>(null);
const svgEl = ref<SVGSVGElement | null>(null);

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
    timeZone: "UTC",
  });
  const numbers = new Intl.NumberFormat(locale.value);
  return {
    x: x(hovered.value),
    ySessions: y(day.sessions),
    yTries: y(day.tries),
    date: format.format(day.date),
    sessions: numbers.format(day.sessions),
    tries: numbers.format(day.tries),
    flip: x(hovered.value) > W * 0.72,
  };
});

const ariaLabel = computed(
  () =>
    `${t("activity.title")} — ${t("activity.sessions")}, ${t("activity.tries")}`,
);
</script>

<template>
  <div v-if="days.length >= 2" class="card activity-card">
    <div class="head">
      <h3>{{ t("activity.title") }}</h3>
      <span v-if="perSessionLabel" class="ratio">{{ perSessionLabel }}</span>
    </div>
    <p class="muted note">{{ t("activity.note") }}</p>

    <!-- Legend: identity is never color-alone; the line ends are direct-labeled too. -->
    <div class="legend">
      <span class="item">
        <span class="chip sessions"></span>{{ t("activity.sessions") }}
      </span>
      <span class="item">
        <span class="chip tries"></span>{{ t("activity.tries") }}
      </span>
    </div>

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

          <path
            :d="triesPath"
            class="line tries"
            vector-effect="non-scaling-stroke"
          />
          <path
            :d="sessionsPath"
            class="line sessions"
            vector-effect="non-scaling-stroke"
          />

          <text
            v-for="label in endLabels"
            :key="label.key"
            :x="W - M.right"
            :y="label.y"
            class="end-label"
          >
            {{ t(`activity.${label.key}`) }}
          </text>

          <template v-if="tooltip">
            <line
              :x1="tooltip.x"
              :x2="tooltip.x"
              :y1="M.top"
              :y2="H - M.bottom"
              class="crosshair"
              vector-effect="non-scaling-stroke"
            />
            <circle
              :cx="tooltip.x"
              :cy="tooltip.yTries"
              r="4.5"
              class="dot tries"
            />
            <circle
              :cx="tooltip.x"
              :cy="tooltip.ySessions"
              r="4.5"
              class="dot sessions"
            />
          </template>
        </svg>

        <div
          v-if="tooltip"
          class="tooltip"
          :class="{ flip: tooltip.flip }"
          :style="{ left: (tooltip.x / W) * 100 + '%' }"
        >
          <span class="date">{{ tooltip.date }}</span>
          <span class="row">
            <span class="chip sessions"></span>
            <span class="label">{{ t("activity.sessions") }}</span>
            <span class="value">{{ tooltip.sessions }}</span>
          </span>
          <span class="row">
            <span class="chip tries"></span>
            <span class="label">{{ t("activity.tries") }}</span>
            <span class="value">{{ tooltip.tries }}</span>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.activity-card {
  // The second series' hue: the site's own blue (the scrollbar accent), not a new color. Green +
  // blue is also the safest pair for red-green colorblindness, which amber/green would not be.
  --series-tries: #4ba7de;

  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  .head {
    display: flex;
    // The ratio is a full sentence in some locales: on a phone it drops under the title whole
    // rather than clipping at the card edge.
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
    margin-bottom: 4px;

    h3 {
      margin: 0;
    }

    .ratio {
      color: var(--primary);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }

  .note {
    text-align: left;
    font-size: 14px;
    margin-bottom: 10px;
  }

  .muted {
    color: var(--secondary-text);
  }

  .legend {
    display: flex;
    gap: 18px;
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--secondary-text);

    .item {
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }

  .chip {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    flex: none;

    &.sessions {
      background: var(--primary);
    }

    &.tries {
      background: var(--series-tries);
    }
  }

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

  .line {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;

    &.sessions {
      stroke: var(--primary);
    }

    &.tries {
      stroke: var(--series-tries);
    }
  }

  .end-label {
    fill: var(--primary-text);
    font-size: 11px;
    text-anchor: end;
    // Halo in the card surface: the labels sit where the lines end, and without it they drown in
    // whichever spike is passing underneath.
    paint-order: stroke;
    stroke: var(--secondary-background);
    stroke-width: 3px;
    stroke-linejoin: round;
  }

  .crosshair {
    stroke: rgba(255, 255, 255, 0.25);
    stroke-width: 1;
    stroke-dasharray: 3 3;
  }

  .dot {
    stroke: var(--secondary-background);
    stroke-width: 2;

    &.sessions {
      fill: var(--primary);
    }

    &.tries {
      fill: var(--series-tries);
    }
  }

  .tooltip {
    position: absolute;
    top: 6px;
    transform: translateX(10px);
    display: flex;
    flex-direction: column;
    gap: 4px;
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

    .row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .label {
      color: var(--secondary-text);
    }

    .value {
      margin-left: auto;
      padding-left: 10px;
      color: var(--primary-text);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
