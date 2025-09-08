<template>
  <div class="timer-wrapper">
    <div class="circle-background" />
    <h1>{{ t("session.countdown") }}</h1>
    <h2>
      <strong>{{
        delta.second() + "," + delta.nano().toString().slice(0, 2)
      }}</strong
      >s
    </h2>
  </div>
</template>

<script setup lang="ts">
import { inject, onUnmounted, PropType, ref } from "vue";
import { UserStore } from "@/objects/stores/UserStore.ts";
import { LocalTime } from "@js-joda/core";
import { useI18n } from "vue-i18n";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { AlertProvider, AlertType } from "@/vue/alert/Alert.ts";
import { invoke } from "@tauri-apps/api/tauri";
import { PlayerStates } from "@/objects/fleet/Player.ts";
import { onBeforeRouteLeave } from "vue-router";
import countdownSound from "@assets/sounds/countdown.mp3";

const delta = ref<LocalTime>(LocalTime.now());
const { t } = useI18n();
const alerts = inject<AlertProvider>("alertProvider");
const sound = new Audio(countdownSound);

let updateTimer = setInterval(() => {
  if (sound.paused && UserStore.player.soundEnable) {
    sound.volume = UserStore.player.soundLevel / 100;
    sound.play();
  }

  if (!UserStore.player.countDown || !UserStore.player.countDown.clickTime)
    return;

  const start: LocalTime = LocalTime.now();
  const click: LocalTime = UserStore.player.countDown.clickTime as LocalTime;

  if (click.isBefore(start)) {
    UserStore.player.countDown = undefined;
    clearInterval(updateTimer);

    switch (UserStore.player.status) {
      case PlayerStates.MAIN_MENU: {
        if (!UserStore.player.isReady) {
          alerts!.sendAlert({
            content: t("alert.research.notReady.content"),
            title: t("alert.research.notReady.title"),
            type: AlertType.WARNING,
          });
          break;
        }
        if (UserStore.player.macroEnable) {
          invoke("rise_anchor");
        }
        break;
      }
      case PlayerStates.CLOSED: {
        alerts!.sendAlert({
          content: t("alert.research.offline.content"),
          title: t("alert.research.offline.title"),
          type: AlertType.WARNING,
        });
        break;
      }
      case PlayerStates.STARTED:
      case PlayerStates.IN_GAME: {
        alerts!.sendAlert({
          content: t("alert.research.notInMenu.content"),
          title: t("alert.research.notInMenu.title"),
          type: AlertType.WARNING,
        });
        break;
      }
    }
    props.session?.clearPlayersStatus();
    return;
  }

  delta.value = click.minusSeconds(start.second());
  delta.value = delta.value.minusNanos(start.nano());
}, 5);

const props = defineProps({
  session: { type: Object as PropType<Fleet>, required: true },
});

onUnmounted(() => {
  clearInterval(updateTimer);
  updateTimer = 0;
  UserStore.player.countDown = undefined;
});

onBeforeRouteLeave((_to, _from, next) => {
  if (UserStore.player.countDown) {
    next(false);
    alerts?.sendAlert({
      content: t("alert.session.notLeave.content"),
      title: t("alert.session.notLeave.title"),
      type: AlertType.WARNING,
    });
  }
});
</script>

<style scoped lang="scss">
.timer-wrapper {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--primary-background);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 12px;

  h1 {
    font-size: 30px;
  }

  h2 {
    strong {
      color: var(--primary);
    }
  }

  .circle-background {
    position: absolute;
    top: 50%;
    z-index: 99;
    width: 40vw;
    height: 40vh;
    left: 50%;
    border-radius: 100%;
    transform: translate(-50%, -50%);
    background: radial-gradient(
      56.39% 55.75% at 50% 50%,
      rgba(255, 255, 255, 0.7) 0%,
      rgba(88, 149, 127, 0.7) 73%,
      rgba(26, 110, 79, 0.7) 100%,
      rgba(26, 110, 79, 0.7) 100%
    );
    filter: blur(127px);
  }
}
</style>
