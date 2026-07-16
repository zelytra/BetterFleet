<template>
  <div
    :class="{ 'session-row': true, locked: !joinable }"
    :title="joinable ? undefined : t('session.privateHint')"
    @click="onClick"
  >
    <div class="banner">
      <div
        class="bg"
        :style="{ backgroundImage: `url(${bannerUrl(session.banner)})` }"
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
import { sessionDisplayName } from "@/objects/fleet/PublicSessionName.ts";
import { bannerUrl } from "@/objects/fleet/Banners.ts";
import { countryFlags } from "@/objects/utils/LangIcons.ts";

const { t } = useI18n();
const props = defineProps({
  session: { type: Object as PropType<PublicSession>, required: true },
});
const emits = defineEmits(["join"]);

// Shared with the search, which must match on what is rendered here rather than the raw field.
const displayName = computed(() => sessionDisplayName(props.session, t));

// The backend withholds a private session's code, so there is nothing to join with: the row shows
// the crew and the padlock, and joining takes the code the host gave you. Clicking anyway would
// emit an empty id — and an empty id is how a session gets *created*.
const joinable = computed(() => !props.session.isPrivate);

function onClick() {
  if (joinable.value) {
    emits("join");
  }
}
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
    filter: brightness(1.06);
  }

  // A private session has no code to join with, so the row must not pretend to be clickable.
  &.locked {
    cursor: default;

    &:hover {
      filter: none;
    }
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
    min-width: 0;

    p {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

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
