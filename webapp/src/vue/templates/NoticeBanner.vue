<template>
  <div class="notice-banner">
    <p class="message"><slot /></p>
    <button
      type="button"
      class="dismiss"
      :aria-label="closeLabel"
      :title="closeLabel"
      @click="emits('close')"
    >
      ✕
    </button>
  </div>
</template>

<script setup lang="ts">
// Small dismissible strip for a one-off, session-level notice (e.g. the Linux raise-anchor
// warning in FleetLobby.vue). Purely presentational: the parent owns the message (via the default
// slot) and whatever persists the dismissal, this just renders the row and reports the close click.
defineProps({
  closeLabel: { type: String, required: false, default: "" },
});
const emits = defineEmits(["close"]);
</script>

<style scoped lang="scss">
.notice-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  flex-shrink: 0;
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 5px;
  border: 1px solid rgba(50, 212, 153, 0.45);
  background: rgba(50, 212, 153, 0.08);

  .message {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 14px;
    color: var(--secondary-text);
  }

  .dismiss {
    all: unset;
    cursor: pointer;
    flex-shrink: 0;
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 13px;
    line-height: 1;
    color: var(--secondary-text);

    &:hover {
      color: var(--primary-text);
    }
  }
}
</style>
