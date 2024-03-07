<template>
  <div class="timer-wrapper">
    <div class="circle-background"/>
    <h1>{{ t('session.countdown') }}</h1>
    <h2><strong>{{ delta.second() + ',' + delta.nano().toString().slice(0, 2) }}</strong>s</h2>
  </div>
</template>

<script setup lang="ts">
import {inject, onUnmounted, PropType, ref} from "vue";
import {UserStore} from "@/objects/stores/UserStore.ts";
import {LocalTime} from "@js-joda/core";
import {useI18n} from "vue-i18n";
import {Fleet} from "@/objects/Fleet.ts";
import {AlertProvider, AlertType} from "@/vue/alert/Alert.ts";
import {invoke} from '@tauri-apps/api/tauri';
import {PlayerStates} from "@/objects/Player.ts";

const delta = ref<LocalTime>(LocalTime.now());
const {t} = useI18n();
const alerts = inject<AlertProvider>("alertProvider");

const updateTimer = setInterval(() => {
  if (!UserStore.player.countDown || !UserStore.player.countDown.clickTime) return;
  const start: LocalTime = LocalTime.now();
  const click: LocalTime = LocalTime.parse(UserStore.player.countDown.clickTime);

  if (click.isBefore(start)) {
    UserStore.player.countDown = undefined;
    clearInterval(updateTimer);

    if (UserStore.player.status == PlayerStates.MAIN_MENU) {
      invoke('drop_anchor');
      props.session?.clearPlayersStatus()
    } else {
      alerts!.sendAlert({
        content: t('alert.cannotRunResearch.content'),
        title: t('alert.cannotRunResearch.title'),
        type: AlertType.WARNING
      })
    }
    return;
  }

  delta.value = click.minusSeconds(start.second())
  delta.value = delta.value.minusNanos(start.nano())
}, 5)

const props = defineProps({session: {type: Object as PropType<Fleet>, required: true}})

onUnmounted(() => {
  clearInterval(updateTimer);
})
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
    background: radial-gradient(56.39% 55.75% at 50% 50%, rgba(255, 255, 255, 0.70) 0%, rgba(88, 149, 127, 0.70) 73%, rgba(26, 110, 79, 0.70) 100%, rgba(26, 110, 79, 0.70) 100%);
    filter: blur(127px);

  }
}
</style>