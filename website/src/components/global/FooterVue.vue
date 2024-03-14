<template>
  <footer>
    <div class="main-footer">
      <div class="card">
        <img src="@/assets/icons/full-logo.svg" alt="full logo"/>
        <p>{{ t('footer.content') }}</p>
        <span>{{ version }}</span>
      </div>
      <div class="card github" @click="openGithub">
        <img src="@/assets/icons/github.svg" class="icon" alt="full logo"/>
        <p>{{ t('footer.github') }}</p>
      </div>
      <div class="card-wrapper">
        <div class="card details warning">
          <h2>{{ t('footer.warning.title') }}</h2>
          <p>{{ t('footer.warning.content') }}</p>
        </div>
        <div class="card details discord" @click="openDiscord">
          <p>{{ t('footer.discord') }} <a href="https://discord.gg/sHPp5CPxf2">Discord</a>.</p>
        </div>
      </div>
    </div>
    <div class="credit-wrapper">
      <p><span>Better Fleet©</span> {{ t('credits.license') }} {{ date }} | {{ t('credits.developed') }}
        <a href="https://zelytra.fr">Zelytra</a>
        {{ t('credits.and') }} <a
            href="https://github.com/dadodasyra">Dadodasyra</a> - {{ t('credits.designed') }}
        <a href="https://zetro.fr">ZeTRro</a>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import {useI18n} from "vue-i18n";
import {ref} from "vue";

const version = ref(import.meta.env.VITE_VERSION);
const {t} = useI18n()
const date = ref<number>((new Date()).getFullYear())

function openGithub() {
  window.open("https://github.com/zelytra/BetterFleet", '_blank');
}

function openDiscord() {
  window.open("https://discord.gg/sHPp5CPxf2", '_blank');
}
</script>

<style scoped lang="scss">
footer {
  margin-top: -26px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  box-sizing: border-box;
  position: relative;
  z-index: 99;

  .main-footer {
    padding: 60px 32px;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    background: url("@/assets/backgrounds/footer.svg");
    background-size: cover;
    display: flex;
    gap: 17px;


    .card-wrapper {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      flex-basis: 45%;
      box-sizing: border-box;
      width: 100%;
      gap: 17px;
    }

    .card {
      box-sizing: border-box;
      padding: 24px;
      flex-basis: 45%;
      background: url("@/assets/backgrounds/card-footer.svg");
      background-size: cover;
      gap: 35px;
      width: 100%;
      display: flex;
      justify-content: center;
      flex-direction: column;
      align-items: center;

      p {
        text-align: center;
        font-size: 18px;
      }

      a {
        color: var(--primary);
        text-decoration-line: underline;
      }

      h2 {
        color: var(--warning);
        position: relative;
        text-align: center;

        &:after {
          display: flex;
          position: absolute;
          content: '';
          bottom: -7px;
          left: 50%;
          transform: translate(-50%, 0);
          background: url("@assets/backgrounds/footer-underline.svg") no-repeat;
          width: 118px;
          height: 10px;
        }
      }

      img.icon {
        width: 90px;
      }

      span {
        color: var(--primary);
      }

      &.github {
        min-width: 300px;
        flex-basis: 10%;
        background: url("@/assets/backgrounds/card-footer-gray.svg");
        background-size: cover;
        cursor: pointer;

        &:hover {
          transform: translateY(-5px);
          filter: brightness(1.1);
        }
      }

      &.warning {
        background: url("@/assets/backgrounds/card-footer-orange.svg");
        background-size: cover;
      }

      &.discord {
        background: url("@/assets/backgrounds/card-footer-blue.svg");
        background-size: cover;
        cursor: pointer;


        &:hover {
          transform: translateY(-5px);
          filter: brightness(1.1);
        }
      }
    }


  }

  .credit-wrapper {
    padding: 20px 0;
    width: 100%;
    display: flex;
    justify-content: center;

    a, span {
      color: var(--primary);
    }
  }
}
</style>