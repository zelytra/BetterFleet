<template>
  <section class="app-section">
    <HeaderComponent />
    <section class="content">
      <router-view v-slot="{ Component }">
        <transition mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </section>
  </section>
  <!-- What's new (#686): mounted in the authed shell, so it can only appear once the player is
       past the login screen, never over the auth page. -->
  <WhatsNewModal />
  <!-- Update prompt (#735 follow-up): same shell, opened from the header's update button. -->
  <UpdateModal />
</template>

<script setup lang="ts">
import HeaderComponent from "@/components/global/HeaderComponent.vue";
import WhatsNewModal from "@/components/WhatsNewModal.vue";
import UpdateModal from "@/components/UpdateModal.vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalKey } from "@/objects/stores/LocalStore.ts";
import { onUnmounted, watch } from "vue";
import { pollGameTick } from "@/objects/fleet/GamePoll.ts";
import router from "@/router";
import { HTTPAxios } from "@/objects/utils/HTTPAxios.ts";

const tokenRefresher = setInterval(() => {
  // updateToken never rejects (a failed refresh clears the bearer and alerts once, #803), so this
  // fire-and-forget can no longer leak an unhandled rejection every second.
  void HTTPAxios.updateToken();
}, 1000);
// The tick body lives in GamePoll.ts, where its "never rejects" contract is unit-tested (#859) -
// this interval fires it fire-and-forget 2.5 times a second.
const gameStatusRefresh: number = setInterval(() => {
  void pollGameTick();
}, 400);

window.onbeforeunload = () => {
  window.localStorage.setItem(
    LocalKey.USER_STORE,
    JSON.stringify(UserStore.player),
  );
};

onUnmounted(() => {
  if (UserStore.player.fleet) {
    UserStore.player.fleet.leaveSession();
  }
  clearInterval(gameStatusRefresh);
  clearInterval(tokenRefresher);
});

watch(
  () => UserStore.player.countDown,
  () => {
    router.push("/fleet/session");
  },
);
</script>

<style scoped lang="scss">
.app-section {
  display: flex;

  .content {
    height: 100vh;
    overflow: hidden;
    overflow-y: auto;
    padding: 12px;
    width: 100%;
    box-sizing: border-box;
    position: relative;
  }
}
</style>
