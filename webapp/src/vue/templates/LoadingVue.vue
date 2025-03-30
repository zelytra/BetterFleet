<template>
  <section v-if="isLoading" class="loading-wrapper">
    <div class="logo">
      <img src="@/assets/icons/heart.svg" alt="heart-logo" />
      <h2>{{ t("appName") }}</h2>
    </div>
    <div class="main-content">
      <img src="@/assets/icons/compass.svg" alt="loading-logo" />
      <slot />
    </div>
    <div class="tips">
      <img src="@/assets/icons/flame.svg" alt="tips-icon" />
      <p>{{ t("loading.tips") }}</p>
    </div>
    <div class="loading-animation">
      <p>{{ t("loading.loading") }}</p>
      <img src="@/assets/icons/legend.svg" alt="login-icon" />
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";

const { t } = useI18n();

defineProps({
  isLoading: Boolean,
});

defineEmits<{
  (e: "update:isLoading", isLoading: boolean): void;
}>();
</script>

<style scoped lang="scss">
.loading-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: var(--primary-background);
  display: flex;
  justify-content: center;
  align-items: center;

  .logo {
    position: absolute;
    top: 0;
    left: 0;

    img {
      width: 250px;
    }

    h2 {
      position: absolute;
      top: 55px;
      left: 25px;
      color: var(--primary);
      font-family: BrushTip, sans-serif;
      font-size: 35px;
    }
  }

  .main-content {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    gap: 24px;

    img {
      width: 50%;
    }

    :slotted(*) {
      font-family: BrushTip, sans-serif;
      font-size: 40px;
    }
  }

  .tips {
    position: absolute;
    bottom: 0;
    left: 0;
    margin: 12px;
    background: rgba(50, 212, 153, 0.2);
    display: flex;
    align-items: center;
    max-width: 350px;
    padding: 26px 18px;
    gap: 18px;
    border-radius: 5px;

    p {
      font-family: Rubik, sans-serif;
    }
  }

  .loading-animation {
    position: absolute;
    bottom: 0;
    right: 0;
    display: flex;
    align-items: center;
    margin: 8px;
    gap: 8px;

    img {
      width: 60px;
      animation: rotating 10s linear infinite;
    }
  }
}

@-webkit-keyframes rotating /* Safari and Chrome */ {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
