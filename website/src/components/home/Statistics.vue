<template>
  <transition>
    <section v-if="stats">
      <h1>{{t('stats.title')}}</h1>
      <div class="stats-cards-wrapper">
        <div class="card">
          <h2>+ {{ stats.download }}</h2>
          <p>{{t('stats.download')}}</p>
        </div>
        <div class="card important">
          <h2>+ {{ onlinePlayer }}</h2>
          <p>{{t('stats.players')}}</p>
        </div>
        <div class="card">
          <h2>+ {{ stats.sessionsOpen }}</h2>
          <p>{{ t('stats.sessions')}}</p>
        </div>
      </div>
    </section>
  </transition>
</template>

<script setup lang="ts">
import {onMounted, ref} from "vue";
import {Stats} from "@/objects/Stats.ts";
import {HTTPAxios} from "@/objects/HTTPAxios.ts";
import {AxiosResponse} from "axios";
import {useI18n} from "vue-i18n";

const stats = ref<Stats>()
const onlinePlayer = ref<number>(0);
const {t} = useI18n();

onMounted(() => {
  new HTTPAxios("stats/all", null).get().then((response: AxiosResponse) => {
    stats.value = response.data as Stats;
  })
  new HTTPAxios("stats/online-users", null).get().then((response: AxiosResponse) => {
    onlinePlayer.value = response.data as number;
  })
})
</script>

<style scoped lang="scss">
section {
  height: 600px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 100px;

  h1 {
    font-family: BrushTip, sans-serif;
    font-size: 60px;
    position: relative;
    text-align: center;

    &:after {
      display: flex;
      position: absolute;
      content: '';
      bottom: 24px;
      left: 50%;
      transform: translate(-50%, 0);
      background: url("@/assets/backgrounds/stats-underline.svg") no-repeat;
      width: 276px;
      height: 9px;
    }
  }

  .stats-cards-wrapper {
    display: flex;
    align-items: center;
    gap: 70px;

    .card {
      width: 350px;
      height: 190px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      background: url("@assets/backgrounds/stats-card.svg") 0 0/100% 100% no-repeat;

      &.important {
        background: url("@/assets/backgrounds/stats-card-important.svg") 0 0/100% 100% no-repeat;
      }

      h2 {
        font-size: 42px;
        color: var(--primary);
      }

      p {
        font-size: 20px;
      }
    }
  }
}
</style>