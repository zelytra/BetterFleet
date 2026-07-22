<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";
import Globe from "globe.gl";
import { RegionCount } from "@/objects/AllianceStats.ts";
import { COUNTRY_CENTROIDS } from "@/objects/CountryCentroids.ts";

// A flat dark texture for the globe, inline — avoids an external earth image and a dependency on
// three's types. It's a 2x2 SVG rect in the app's dark tone, stretched over the sphere.
const DARK_GLOBE_TEXTURE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='2'%20height='2'%3E%3Crect%20width='2'%20height='2'%20fill='%2318202c'/%3E%3C/svg%3E";

// The 3D user-region globe (issue #673). Lazy-loaded (globe.gl bundles three.js) so it never
// weighs down the rest of the site. Renders one bar per region at its country centroid, its height
// scaled by the number of attempts — an anonymous, country-level heatmap of where players are.

const props = defineProps<{ regions: RegionCount[] }>();
const container = ref<HTMLElement | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let globe: any = null;

interface GlobePoint {
  lat: number;
  lng: number;
  count: number;
  region: string;
  ratio: number;
}

function points(): GlobePoint[] {
  const max = Math.max(1, ...props.regions.map((r) => r.attempts));
  return props.regions.flatMap((r) => {
    const centroid = COUNTRY_CENTROIDS[r.region];
    if (!centroid) return [];
    return [
      {
        lat: centroid[0],
        lng: centroid[1],
        count: r.attempts,
        region: r.region.toUpperCase(),
        ratio: r.attempts / max,
      },
    ];
  });
}

onMounted(() => {
  if (!container.value) return;
  globe = new Globe(container.value)
    .backgroundColor("rgba(0,0,0,0)")
    .globeImageUrl(DARK_GLOBE_TEXTURE)
    .showAtmosphere(true)
    .atmosphereColor("#32d499")
    .atmosphereAltitude(0.16)
    .pointsData(points())
    .pointLat("lat")
    .pointLng("lng")
    .pointColor(() => "#32d499")
    .pointAltitude((d: object) => 0.02 + (d as GlobePoint).ratio * 0.45)
    .pointRadius(0.55)
    .pointLabel(
      (d: object) => `${(d as GlobePoint).region}: ${(d as GlobePoint).count}`,
    )
    .width(container.value.clientWidth)
    .height(360);

  const controls = globe.controls();
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.enableZoom = false;
});

watch(
  () => props.regions,
  () => {
    if (globe) globe.pointsData(points());
  },
);

onUnmounted(() => {
  if (globe && typeof globe._destructor === "function") globe._destructor();
  globe = null;
});
</script>

<template>
  <div ref="container" class="globe"></div>
</template>

<style scoped>
.globe {
  width: 100%;
  min-height: 360px;
  display: flex;
  justify-content: center;
}
</style>
