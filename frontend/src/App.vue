<template>
  <section class="app-section">
    <Header />
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </section>
  </section>
  <Loading :is-loading="false">
    <h1>{{ t("loading.targetGame") }}</h1>
  </Loading>
  <FirstLogin
    :is-display="
      !UserStore.player.username || UserStore.player.username.length === 0
    "
  />
  <AlertComponent />
</template>

<script setup lang="ts">
import Header from "@/components/global/Header.vue";
import Loading from "@/vue/templates/Loading.vue";
import { useI18n } from "vue-i18n";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import { inject, onMounted } from "vue";
import FirstLogin from "@/vue/templates/FirstLogin.vue";
import { PlayerStates } from "@/objects/Fleet.ts";
import AlertComponent from "@/vue/alert/AlertComponent.vue";
import { AlertProvider, AlertType } from "@/vue/alert/Alert.ts";

const { t } = useI18n();
const alertProvider = inject("alertProvider") as AlertProvider;

onMounted(() => {
  UserStore.init({
    lang: "en",
    isMaster: false,
    isReady: false,
    status: PlayerStates.OFFLINE,
    username: "",
  });
  setInterval(() => {
    alertProvider.sendAlert({
      content: "Description",
      title: "Title",
      type: AlertType.VALID,
    });
  }, 1000);
});
window.onbeforeunload = () => {
  window.localStorage.setItem(
    LocalKey.USER_STORE,
    JSON.stringify(UserStore.player),
  );
};
</script>

<style scoped lang="scss">
.app-section {
  display: flex;

  .content {
    height: 100vh;
    overflow: hidden;
    overflow-y: auto;
    padding: 7px 10px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }
}
</style>
