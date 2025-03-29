<template>
  <div class="refresh">
    <h3>{{ t("session.refresh") }}</h3>
  </div>
  <div class="player-count">
    <h3>{{ 42 }}</h3>
    <p v-if="true">{{ t("session.player.online") }}</p>
    <p v-else>{{ t("session.player.online") }}</p>
  </div>
  <div class="session create" @click="emits('createSession')">
    <p>{{ t("session.choice.createSession") }}</p>
    <p class="description">{{ t("session.choice.createComment") }}</p>
  </div>
  <h3>OR</h3>
  <div class="session join" @click="isModalOpen = true">
    <p>{{ t("session.choice.joinSession") }}</p>
    <p class="description">{{ t("session.choice.joinComment") }}</p>
  </div>
  <div class="discord">
    <img src="@/assets/icons/contributors/translator.svg" />
    <p v-if="true">
      {{ t("session.issue") }}
      <a href="">{{ t("report.faq.button.discord") }}</a>
    </p>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const isModalOpen = defineModel<boolean>("isModalOpen", {
  required: false,
  default: () => false,
});
const emits = defineEmits(["createSession"]);
</script>

<style scoped lang="scss">
.discord {
  background-image: url("@assets/backgrounds/brown-display.svg");
  width: 256px;
  height: 132px;
  display: flex;
  box-sizing: border-box;
  justify-content: center;
  align-items: center;
  padding: 8px;

  img {
    width: 60px;
  }

  p {
    text-align: center;
    padding: 12px;

    a {
      color: var(--warning);
    }
  }
}

.player-count {
  background-image: url("@assets/backgrounds/green-display.svg");
  width: 256px;
  height: 103px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  h3 {
    color: var(--primary);
  }
}

.refresh {
  background-image: url("@assets/backgrounds/blue-button.svg");
  width: 256px;
  height: 90px;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;

  &:hover {
    scale: 1.01;
  }
}

.session {
  width: 256px;
  height: 316px;
  display: flex;
  box-sizing: border-box;
  padding: 12px;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  gap: 13px;
  position: relative;

  &:hover {
    scale: 1.01;
  }

  &.create {
    background-image: url("@assets/banners/create_session.svg");
  }

  &.join {
    background-image: url("@assets/banners/join_session.svg");
    background-blend-mode: darken;
  }

  &:after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.35);
    pointer-events: none;
    z-index: 1;
    mask-image: url("@assets/banners/create_session.svg");
    -webkit-mask-image: url("@assets/banners/create_session.svg");
  }

  p {
    z-index: 2;
    text-align: center;

    &.description {
      color: var(--secondary-text);
    }
  }
}
</style>
