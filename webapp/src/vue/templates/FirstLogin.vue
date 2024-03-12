<template>
  <section v-if="isDisplay" class="loading-wrapper">
    <div class="logo">
      <img src="@/assets/icons/heart.svg" alt="heart-logo" />
      <h2>{{ t("appName") }}</h2>
    </div>

    <div class="username-wrapper">
      <div class="main-content">
        <h1>{{ t("firstLogin.title") }}</h1>
        <p>{{ t("firstLogin.description") }}</p>
        <InputText
          v-model:input-value="usernameInput"
          placeholder="TimEpsilon"
          @validate="updateUsername"
        />
      </div>
      <button class="big-button" @click="updateUsername">
        <h2>{{ t("firstLogin.button.title") }}</h2>
        <p>{{ t("firstLogin.button.description") }}</p>
      </button>
    </div>

    <div class="tips">
      <img src="@/assets/icons/flame.svg" alt="tips-icon" />
      <p>{{ t("firstLogin.tips") }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import InputText from "@/vue/form/InputText.vue";
import { ref } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";

const { t } = useI18n();
const usernameInput = ref<string>("");

defineProps({
  isDisplay: Boolean,
});

defineEmits<{
  (e: "update:isDisplay", isDisplay: boolean): void;
}>();

function updateUsername() {
  UserStore.player.username = usernameInput.value;
}
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

  .username-wrapper {
    background: var(--secondary-background);
    border-radius: 5px;
    overflow: hidden;
    width: 400px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 15px;
    margin-bottom: 50px;

    .main-content {
      padding: 30px 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      gap: 20px;
      box-sizing: border-box;

      h1 {
        color: var(--primary);
        font-size: 40px;
        font-family: BrushTip, sans-serif;
        text-align: center;
      }

      p {
        color: var(--secondary-text);
        font-size: 14px;
        line-height: 20px;
        text-align: center;
      }
    }

    button {
      all: unset;
      cursor: pointer;
      width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 20px 40px;
      background: linear-gradient(
        0deg,
        rgba(50, 144, 212, 0.2) 0%,
        rgba(50, 144, 212, 0.07) 108.45%
      );
      box-sizing: border-box;
      gap: 15px;

      h2 {
        text-align: center;
        font-size: 20px;
      }

      p {
        text-align: center;
        color: var(--secondary-text);
        font-size: 16px;
      }
    }
  }

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

  .tips {
    position: absolute;
    bottom: 0;
    right: 0;
    margin: 12px;
    background: rgba(50, 212, 153, 0.2);
    display: flex;
    align-items: center;
    max-width: 350px;
    padding: 18px 16px;
    gap: 18px;
    border-radius: 5px;

    p {
      font-family: Rubik, sans-serif;
    }
  }
}
</style>
