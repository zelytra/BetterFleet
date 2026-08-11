<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { fetchTriesHistogram, TryCount } from "@/objects/AllianceStats.ts";

// Which try finally forms the alliance: of every countdown that ended with one, the share that
// happened on try 1, 2, 3... The dashboard's "avg. tries" tile compresses this into one number;
// the shape is the actual answer to "should we keep going?". Same self-fetching pattern as
// DownloadsCard: global (all regions, all time), off the page until it has data, so the region
// filter's reloads never touch it. Axis-free on purpose - eight bars carry their own value labels,
// which reads better than a percentage axis nobody has to interpolate against.

const { t, locale } = useI18n();

const rows = ref<TryCount[]>([]);

onMounted(async () => {
  try {
    rows.value = await fetchTriesHistogram();
  } catch {
    rows.value = []; // unreachable backend: the card just stays hidden
  }
});

const W = 720;
const H = 240;
const M = { top: 30, right: 14, bottom: 28, left: 14 };
// Everything from the 8th try on folds into one final "8+" band: the tail is long and thin, and
// one honest band says "it dragged" better than a comb of near-empty bars.
const TAIL_FROM = 8;

const totalConverged = computed(() =>
  rows.value.reduce((sum, row) => sum + row.converged, 0),
);

interface Band {
  label: string;
  converged: number;
  share: number; // of all converged attempts
}

const bands = computed<Band[]>(() => {
  if (totalConverged.value === 0) return [];
  const maxTry = Math.max(...rows.value.map((r) => r.tryNumber));
  const upTo = Math.min(maxTry, TAIL_FROM - 1);
  const out: Band[] = [];
  for (let n = 1; n <= upTo; n++) {
    const row = rows.value.find((r) => r.tryNumber === n);
    out.push({ label: String(n), converged: row?.converged ?? 0, share: 0 });
  }
  if (maxTry >= TAIL_FROM) {
    const tail = rows.value
      .filter((r) => r.tryNumber >= TAIL_FROM)
      .reduce((sum, r) => sum + r.converged, 0);
    out.push({ label: `${TAIL_FROM}+`, converged: tail, share: 0 });
  }
  for (const band of out) {
    band.share = band.converged / totalConverged.value;
  }
  return out;
});

const percentFormat = computed(
  () =>
    new Intl.NumberFormat(locale.value, {
      style: "percent",
      maximumFractionDigits: 0,
    }),
);

// The headline the whole chart boils down to. {percent} is Intl-formatted (sign included) so the
// headline, the bar labels and the tooltip all write percentages the same way per locale.
const firstTryLabel = computed(() => {
  const first = bands.value[0];
  if (!first || first.label !== "1") return "";
  return t("alliance.triesChart.firstTry", {
    percent: percentFormat.value.format(first.share),
  });
});

const maxShare = computed(() =>
  Math.max(0.01, ...bands.value.map((b) => b.share)),
);

interface Bar {
  label: string;
  converged: number;
  share: number;
  x: number; // band left edge (hover hit target)
  bandWidth: number;
  barX: number;
  barWidth: number;
  barY: number;
  path: string; // bar outline, top corners rounded, flat on the baseline
}

const bars = computed<Bar[]>(() => {
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const baseline = H - M.bottom;
  const bandWidth = plotW / bands.value.length;
  const barWidth = Math.min(bandWidth * 0.5, 56);
  return bands.value.map((band, i) => {
    const x = M.left + i * bandWidth;
    const barX = x + (bandWidth - barWidth) / 2;
    const height = Math.max(
      band.share > 0 ? 2 : 0,
      (band.share / maxShare.value) * plotH,
    );
    const top = baseline - height;
    const r = Math.min(4, height);
    const path =
      `M${barX},${baseline} L${barX},${(top + r).toFixed(2)} ` +
      `Q${barX},${top.toFixed(2)} ${(barX + r).toFixed(2)},${top.toFixed(2)} ` +
      `L${(barX + barWidth - r).toFixed(2)},${top.toFixed(2)} ` +
      `Q${(barX + barWidth).toFixed(2)},${top.toFixed(2)} ${(barX + barWidth).toFixed(2)},${(top + r).toFixed(2)} ` +
      `L${(barX + barWidth).toFixed(2)},${baseline} Z`;
    return {
      label: band.label,
      converged: band.converged,
      share: band.share,
      x,
      bandWidth,
      barX,
      barWidth,
      barY: top,
      path,
    };
  });
});

const hovered = ref<number | null>(null);

const tooltip = computed(() => {
  if (hovered.value === null) return null;
  const bar = bars.value[hovered.value];
  if (!bar) return null;
  return {
    x: bar.x + bar.bandWidth / 2,
    label: t("alliance.triesChart.tryLabel", { n: bar.label }),
    detail: t("alliance.triesChart.tooltip", {
      count: new Intl.NumberFormat(locale.value).format(bar.converged),
      percent: percentFormat.value.format(bar.share),
    }),
    flip: bar.x + bar.bandWidth / 2 > W * 0.72,
  };
});

const ariaLabel = computed(
  () => `${t("alliance.triesChart.title")} — ${firstTryLabel.value}`,
);
</script>

<template>
  <div v-if="bands.length" class="card tries-card">
    <div class="head">
      <h3>{{ t("alliance.triesChart.title") }}</h3>
      <span v-if="firstTryLabel" class="first-try">{{ firstTryLabel }}</span>
    </div>
    <p class="muted note">{{ t("alliance.triesChart.note") }}</p>

    <div class="chart-scroll">
      <div class="chart-wrap">
        <svg
          :viewBox="`0 0 ${W} ${H}`"
          role="img"
          :aria-label="ariaLabel"
          @mouseleave="hovered = null"
        >
          <line
            :x1="M.left"
            :x2="W - M.right"
            :y1="H - M.bottom"
            :y2="H - M.bottom"
            class="axis"
            vector-effect="non-scaling-stroke"
          />

          <g v-for="(bar, i) in bars" :key="bar.label">
            <path
              :d="bar.path"
              class="bar"
              :class="{ hovered: hovered === i }"
            />
            <!-- The value each bar carries, in text ink: this chart has no y-axis to read against. -->
            <text
              :x="bar.x + bar.bandWidth / 2"
              :y="bar.barY - 8"
              class="value"
            >
              {{ percentFormat.format(bar.share) }}
            </text>
            <text
              :x="bar.x + bar.bandWidth / 2"
              :y="H - M.bottom + 18"
              class="tick"
            >
              {{ bar.label }}
            </text>
            <!-- Hover hit target: the full column, much bigger than the bar itself. -->
            <rect
              :x="bar.x"
              :y="M.top"
              :width="bar.bandWidth"
              :height="H - M.top - M.bottom"
              class="hit"
              @mouseenter="hovered = i"
            />
          </g>
        </svg>

        <div
          v-if="tooltip"
          class="tooltip"
          :class="{ flip: tooltip.flip }"
          :style="{ left: (tooltip.x / W) * 100 + '%' }"
        >
          <span class="try">{{ tooltip.label }}</span>
          <span class="detail">{{ tooltip.detail }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.tries-card {
  background: var(--secondary-background);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 22px;

  .head {
    display: flex;
    // The headline is a full sentence in some locales: on a phone it drops under the title whole
    // rather than clipping at the card edge.
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 4px 12px;
    margin-bottom: 4px;

    h3 {
      margin: 0;
    }

    .first-try {
      color: var(--primary);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
  }

  .note {
    text-align: left;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .muted {
    color: var(--secondary-text);
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

  .axis {
    stroke: rgba(255, 255, 255, 0.18);
    stroke-width: 1;
  }

  .bar {
    fill: var(--primary);
    opacity: 0.75;

    &.hovered {
      opacity: 1;
    }
  }

  .value {
    fill: var(--primary-text);
    font-size: 11px;
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  .tick {
    fill: var(--secondary-text);
    font-size: 11px;
    text-anchor: middle;
  }

  .hit {
    fill: transparent;
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

    .try {
      color: var(--secondary-text);
    }

    .detail {
      color: var(--primary-text);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
