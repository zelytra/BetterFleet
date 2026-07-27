<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

/**
 * A screenshot of the application's session lobby at one moment of the alliance flow.
 *
 * The four pictures are captured from the real app — the actual components, styles and translations,
 * in its shipped 1260x760 window — by a headless render of the lobby fed a fabricated session.
 * Reaching those states for real would take four accounts, a running backend and some luck; what the
 * visitor sees is nonetheless the app itself, not a drawing of it. `npm run shots` from `webapp/`
 * retakes them all: see `webapp/tools/lobby-shots/README.md`.
 *
 * Captured in the two locales that are written by hand; the other three fall back to English rather
 * than shipping five sets of the same four images.
 */
const props = defineProps<{
  variant: "session" | "ready" | "countdown" | "grouped";
  /** The caption, reused as the image's alternative text. */
  label: string;
}>();

const { locale } = useI18n();

const SHOTS = import.meta.glob<string>("@assets/steps/*.webp", {
  eager: true,
  import: "default",
  query: "?url",
});

// The lobby is 1260x760 in the app, except the last shot, which needs 80px more for the recap card.
const HEIGHT = { session: 760, ready: 760, countdown: 760, grouped: 840 };

const src = computed(() => {
  const lang = locale.value === "fr" ? "fr" : "en";
  const path = Object.keys(SHOTS).find((p) =>
    p.endsWith(`/${props.variant}-${lang}.webp`),
  );
  return path ? SHOTS[path] : "";
});
</script>

<template>
  <img
    class="lobby-shot"
    :src="src"
    :alt="label"
    width="1260"
    :height="HEIGHT[variant]"
    loading="lazy"
    decoding="async"
  />
</template>

<style scoped lang="scss">
.lobby-shot {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
</style>
