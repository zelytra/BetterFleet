<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import ModalTemplate from "@/vue/templates/ModalTemplate.vue";
import { UpdateStore, downloadAndInstallUpdate } from "@/objects/Updater.ts";
import { releaseUrl } from "@/objects/WhatsNew.ts";

// The update prompt (#735 follow-up), opened from the header's update button. Shows the new
// version's notes and drives download -> install -> relaunch, with progress. Self-contained: it
// reads UpdateStore and mounts once in the authed shell next to WhatsNewModal.

const { t } = useI18n();

const open = computed({
  get: () => UpdateStore.modalOpen,
  set: (value) => (UpdateStore.modalOpen = value),
});

const percent = computed(() => {
  if (UpdateStore.total <= 0) return null; // size unknown yet: indeterminate bar
  return Math.min(
    100,
    Math.round((UpdateStore.downloaded / UpdateStore.total) * 100),
  );
});
</script>

<template>
  <ModalTemplate v-model:is-modal-open="open">
    <div class="update-modal">
      <h2>{{ t("update.title", { version: UpdateStore.version }) }}</h2>

      <ul v-if="UpdateStore.notes">
        <li v-for="(line, index) in UpdateStore.notes" :key="index">
          {{ line }}
        </li>
      </ul>
      <p v-else class="offline">{{ t("update.noNotes") }}</p>

      <!-- Download progress: a determinate bar once the size is known, indeterminate before. -->
      <div v-if="UpdateStore.status === 'downloading'" class="progress">
        <div class="track" :class="{ indeterminate: percent === null }">
          <div
            class="fill"
            :style="percent !== null ? { width: percent + '%' } : {}"
          ></div>
        </div>
        <span class="pct">{{
          percent !== null ? percent + "%" : t("update.downloading")
        }}</span>
      </div>

      <p v-else-if="UpdateStore.status === 'installing'" class="installing">
        {{ t("update.restarting") }}
      </p>

      <p v-if="UpdateStore.failed" class="failed">
        {{ t("update.failed") }}
        <a :href="releaseUrl(UpdateStore.version)" target="_blank">
          {{ t("update.manual") }}
        </a>
      </p>

      <button
        v-if="UpdateStore.status !== 'installing'"
        class="install-button"
        :disabled="UpdateStore.status === 'downloading'"
        @click="downloadAndInstallUpdate()"
      >
        {{ UpdateStore.failed ? t("update.retry") : t("update.install") }}
      </button>
    </div>
  </ModalTemplate>
</template>

<style scoped lang="scss">
.update-modal {
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

  .progress {
    display: flex;
    align-items: center;
    gap: 10px;

    .track {
      position: relative;
      flex: 1;
      height: 8px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;

      .fill {
        height: 100%;
        background: var(--primary);
        border-radius: 4px;
        transition: width 0.2s ease;
      }

      // Size unknown: sweep a fixed-width fill so the bar reads as "working", not "0%".
      &.indeterminate .fill {
        width: 35%;
        animation: sweep 1.1s ease-in-out infinite;
      }
    }

    .pct {
      font-variant-numeric: tabular-nums;
      font-size: 13px;
      color: var(--secondary-text);
      white-space: nowrap;
    }
  }

  @keyframes sweep {
    0% {
      margin-left: -35%;
    }
    100% {
      margin-left: 100%;
    }
  }

  .installing {
    color: var(--primary);
  }

  .failed {
    color: var(--warning);
    font-size: 14px;

    a {
      color: var(--primary);
      margin-left: 4px;

      &:hover {
        text-decoration: underline;
      }
    }
  }

  .install-button {
    all: unset;
    align-self: flex-start;
    cursor: pointer;
    padding: 8px 18px;
    border-radius: 6px;
    background: var(--primary);
    color: var(--primary-background);
    font-weight: 700;

    &:hover {
      filter: brightness(1.08);
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
}
</style>
