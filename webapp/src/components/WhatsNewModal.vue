<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import LocalStore, { LocalKey } from "@/objects/stores/LocalStore.ts";
import {
  fetchReleaseNotes,
  releaseUrl,
  whatsNewDecision,
} from "@/objects/WhatsNew.ts";

// "What's new" after an auto-update (#686). Self-contained: mounted once in App.vue, it decides
// from the recorded last-seen version whether anything is due, fetches the release notes (plain
// link fallback), and records the version once the player closes it — so it shows once.

const { t } = useI18n();

const open = ref(false);
const lines = ref<string[] | null>(null);
const version = String(import.meta.env.VITE_VERSION ?? "");
const lastSeen = LocalStore(LocalKey.LAST_SEEN_VERSION, null);

onMounted(async () => {
  const decision = whatsNewDecision(
    lastSeen.value as string | null,
    version || undefined,
  );
  if (decision === "adopt-silently") {
    // Fresh install: nothing is "new" to a first-time player.
    lastSeen.value = version;
    return;
  }
  if (decision !== "show") return;
  lines.value = await fetchReleaseNotes(version);
  open.value = true;
});

// Closing — the X, a click outside, Esc — marks the version as seen for good.
watch(open, (isOpen, wasOpen) => {
  if (wasOpen && !isOpen) {
    lastSeen.value = version;
  }
});
</script>

<template>
  <ModalTemplate v-model:is-modal-open="open">
    <div class="whats-new">
      <h2>{{ t("whatsnew.title", { version }) }}</h2>
      <ul v-if="lines">
        <li v-for="(line, index) in lines" :key="index">{{ line }}</li>
      </ul>
      <p v-else class="offline">{{ t("whatsnew.offline") }}</p>
      <a :href="releaseUrl(version)" target="_blank">
        {{ t("whatsnew.full") }}
      </a>
    </div>
  </ModalTemplate>
</template>

<style scoped lang="scss">
.whats-new {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 28px 32px;
  max-width: 560px;
  max-height: 70vh;
  overflow-y: auto;

  h2 {
    color: var(--primary);
  }

  ul {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-left: 18px;

    li {
      color: var(--secondary-text);
      font-size: 14px;
      line-height: 1.5;
    }
  }

  .offline {
    color: var(--secondary-text);
  }

  a {
    color: var(--primary);
    align-self: flex-start;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
