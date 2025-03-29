<template>
  <div class="public-session-wrapper">
    <div class="filter-wrapper"></div>
    <div class="sessions-wrapper">
      <FleetSession
        v-for="session of sessions"
        :key="session.name"
        :session="session"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import FleetSession from "@/vue/fleet/FleetSession.vue";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

const { t } = useI18n();
const sessions = ref<PublicSession[]>([]);
let index = 0;
countryFlags.forEach((_flag, key) => {
  sessions.value.push({
    name: t("session.name." + index),
    playerAmount: index,
    admin: ["Zelytra"],
    banner: 0,
    isPrivate: index % 2 == 0,
    region: key,
  });
  index++;
});
//defineProps({
//  sessions: {
//    type: Object as PropType<PublicSession[]>,
//    required: true,
//  },
//});
</script>

<style scoped lang="scss">
.public-session-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  height: 100%;

  .filter-wrapper {
    height: 40px;
    background: var(--primary-background-static);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 5px;
  }

  .sessions-wrapper {
    background: var(--secondary-background);
    padding: 8px;
    height: 100%;
    border-radius: 5px;
    overflow: hidden;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
