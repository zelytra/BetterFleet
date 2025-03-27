<template>
  <div class="session-wrapper">
    <div class="side-content">
      <p>{{ session.admin.join(", ") }}</p>
    </div>
    <div class="side-content">{{ session.name }}</div>
    <div class="side-content">
      <p>
        {{ session.playerAmount }}
        {{
          session.playerAmount > 1
            ? t("session.playersLabel")
            : t("session.playerLabel")
        }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
defineProps({
  session: {
    type: Object as PropType<PublicSession>,
    required: true,
  },
});
</script>

<style scoped lang="scss"></style>
