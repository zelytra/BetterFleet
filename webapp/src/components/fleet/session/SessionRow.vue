<template>
  <div class="session-row" @click="$emit('join')">
    <div class="banner">
      <div
        class="bg"
        :style="{
          backgroundImage: `url(/banners/session${session.banner}.svg)`,
        }"
      />
    </div>
    <div class="col left">
      <img
        v-if="countryFlags.has(session.region)"
        :src="countryFlags.get(session.region)"
        class="flag"
        alt="region"
      />
      <p class="admins">{{ session.admin.join(", ") }}</p>
    </div>
    <div class="col name">
      <p>{{ displayName }}</p>
    </div>
    <div class="col right">
      <p>
        {{ session.playerAmount }}
        {{
          session.playerAmount > 1
            ? t("session.playersLabel")
            : t("session.playerLabel")
        }}
      </p>
      <img
        v-if="session.isPrivate"
        src="@/assets/icons/lock.svg"
        class="lock"
        alt="private"
      />
      <img
        v-else
        src="@/assets/icons/lock_open.svg"
        class="lock"
        alt="public"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, PropType } from "vue";
import { useI18n } from "vue-i18n";
import { PublicSession } from "@/objects/fleet/PublicSessions.ts";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

const { t } = useI18n();
const props = defineProps({
  session: { type: Object as PropType<PublicSession>, required: true },
});
defineEmits(["join"]);

// Default sessions carry a numeric name seed the browser localizes into a pirate name; a
// master-set custom name (issue #604) is shown as-is.
const displayName = computed(() =>
  /^\d+$/.test(props.session.name)
    ? t("session.name." + props.session.name)
    : props.session.name,
);
</script>

<style scoped lang="scss">
.session-row {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 17px;
  border-radius: 5px;
  cursor: pointer;

  &:hover {
    scale: 1.008;
  }

  .banner {
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: 5px;
    overflow: hidden;
    opacity: 0.5;

    .bg {
      position: absolute;
      inset: 0;
      background-repeat: no-repeat;
      background-size: cover;
      background-position: center;
      filter: blur(0.5px);
    }
  }

  .col {
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 10px;
    white-space: nowrap;

    &.left {
      justify-self: start;
    }

    &.name {
      justify-self: center;
    }

    &.right {
      justify-self: end;
    }

    .flag {
      width: 24px;
      height: 24px;
      border-radius: 500px;
      object-fit: cover;
    }

    .lock {
      width: 16px;
    }
  }
}
</style>
