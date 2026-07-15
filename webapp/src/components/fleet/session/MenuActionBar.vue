<template>
  <div class="menu-wrapper">
    <div class="refresh" @click="store.refresh()">
      <h3>{{ t("session.refresh") }}</h3>
    </div>
    <div class="player-count">
      <h3>{{ store.state.connectedPlayers }}</h3>
      <p>{{ t("session.player.online") }}</p>
    </div>
    <div class="session create" @click="emits('createSession')">
      <p>{{ t("session.choice.createSession") }}</p>
      <p class="description">{{ t("session.choice.createComment") }}</p>
    </div>
    <h3 class="or">{{ t("session.or") }}</h3>
    <div class="session join" @click="isModalOpen = true">
      <p>{{ t("session.choice.joinSession") }}</p>
      <p class="description">{{ t("session.choice.joinComment") }}</p>
    </div>
    <div class="discord">
      <img src="@/assets/icons/contributors/translator.svg" alt="book" />
      <p>
        {{ t("session.issue") }}
        <a href="https://discord.com/invite/sHPp5CPxf2" target="_blank"
          >Discord!</a
        >
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { PublicSessionsStore } from "@/objects/fleet/PublicSessionsStore.ts";

const { t } = useI18n();
const store = PublicSessionsStore;
const isModalOpen = defineModel<boolean>("isModalOpen", {
  required: false,
  default: () => false,
});
const emits = defineEmits(["createSession"]);
</script>

<style scoped lang="scss">
.menu-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;

  .or {
    color: var(--secondary-text);
  }

  .refresh {
    background-image: url("@assets/backgrounds/blue-button.svg");
    background-size: cover;
    width: 256px;
    height: 90px;
    display: flex;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    aspect-ratio: 256 / 90;

    &:hover {
      scale: 1.01;
    }
  }

  .player-count {
    background-image: url("@assets/backgrounds/green-display.svg");
    background-size: cover;
    width: 256px;
    height: 78px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    aspect-ratio: 256 / 78;

    h3 {
      color: var(--primary);
    }
  }

  .session {
    width: 256px;
    height: 152px;
    display: flex;
    box-sizing: border-box;
    padding: 12px;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    cursor: pointer;
    gap: 13px;
    position: relative;
    background-repeat: no-repeat;
    background-size: cover;

    &:hover {
      scale: 1.01;
    }

    &.create {
      background-image: url("@assets/banners/create_session.svg");
      aspect-ratio: 256 / 152;
    }

    &.join {
      background-image: url("@assets/banners/join_session.svg");
      background-blend-mode: darken;
      aspect-ratio: 256 / 152;
    }

    p {
      z-index: 2;
      text-align: center;

      &.description {
        color: var(--secondary-text);
      }
    }
  }

  .discord {
    background-image: url("@assets/backgrounds/brown-display.svg");
    background-size: cover;
    width: 256px;
    height: 98px;
    display: flex;
    box-sizing: border-box;
    justify-content: center;
    align-items: center;
    padding: 8px;
    aspect-ratio: 256 / 98;

    img {
      width: 60px;
    }

    p {
      font-size: 14px;
      text-align: center;
      padding: 12px;

      a {
        color: var(--warning);
      }
    }
  }
}
</style>
