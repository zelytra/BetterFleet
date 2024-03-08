<template>
  <section class="app-section">
    <Header/>
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component"/>
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
  <AlertComponent/>
</template>

<script setup lang="ts">
import Header from "@/components/global/Header.vue";
import Loading from "@/vue/templates/Loading.vue";
import {useI18n} from "vue-i18n";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {LocalKey} from "@/objects/stores/LocalStore.ts";
import {onMounted} from "vue";
import FirstLogin from "@/vue/templates/FirstLogin.vue";
import AlertComponent from "@/vue/alert/AlertComponent.vue";
import {PlayerStates} from "@/objects/Player.ts";

const {t} = useI18n();
document.addEventListener('contextmenu', event => event.preventDefault());
onMounted(() => {
  UserStore.init({
    lang: "en",
    isMaster: false,
    isReady: false,
    status: PlayerStates.CLOSED,
    username: "",
  });
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
