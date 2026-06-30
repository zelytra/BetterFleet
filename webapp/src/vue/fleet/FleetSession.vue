<template>
  <div class="session-wrapper">
    <div class="background-banner-container">
      <div
        class="bg"
        :style="{
          backgroundImage: `url(/banners/session${Math.round(Math.random() * 3)}.svg)`,
        }"
      />
    </div>
    <div class="side-content">
      <img
        v-if="countryFlags.has(session.region)"
        :src="countryFlags.get(session.region)"
        class="region-flag"
        alt="regien flag"
      />
      <p>{{ session.admin.join(", ") }}</p>
    </div>
    <div class="side-content">
      <p>{{ session.name }}</p>
    </div>
    <div class="side-content">
      <p>
        {{ session.playerAmount }}
        {{
          session.playerAmount > 1
            ? t("session.playersLabel")
            : t("session.playerLabel")
        }}
      </p>
      <img v-if="session.isPrivate" src="@/assets/icons/lock.svg" alt="lock" />
      <img v-else src="@/assets/icons/lock_open.svg" alt="not lock" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { PropType } from "vue";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import { useI18n } from "vue-i18n";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

const { t } = useI18n();
defineProps({
  session: {
    type: Object as PropType<PublicSession>,
    required: true,
  },
});
</script>

<style scoped lang="scss">
.session-wrapper {
  width: 100%;
  display: flex;
  box-sizing: border-box;
  justify-content: space-between;
  padding: 12px 17px;
  border-radius: 5px;
  position: relative;
  cursor: pointer;

  &:hover {
    scale: 1.008;
  }

  .background-banner-container {
    position: absolute;
    top: 0;
    border-radius: 5px;
    left: 0;
    z-index: 5;
    width: 100%;
    overflow: hidden;
    height: 100%;
    opacity: 0.5;

    .bg {
      position: absolute;
      top: 0;
      border-radius: 5px;
      left: 0;
      z-index: 4;
      width: 100%;
      height: 100%;

      filter: blur(0.5px);
      background-repeat: no-repeat;
      background-size: cover;
      background-position: center;
    }
  }

  .side-content {
    display: flex;
    gap: 10px;
    z-index: 6;
    white-space: nowrap;

    p {
      text-align: center;
    }

    .region-flag {
      width: 24px;
      height: 24px;
      border-radius: 500px;
    }
  }
}
</style>
