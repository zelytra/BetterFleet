<template>
  <footer>
    <div class="main-footer">
      <div class="card">
        <img src="@/assets/icons/full-logo.svg" alt="full logo" />
        <p>{{ t("footer.content") }}</p>
        <span>{{ version }}</span>
      </div>
      <div class="card github" @click="openGithub">
        <img src="@/assets/icons/github.svg" class="icon" alt="full logo" />
        <p>{{ t("footer.github") }}</p>
      </div>
      <div class="card-wrapper">
        <div class="card details warning">
          <h2>{{ t("footer.warning.title") }}</h2>
          <p>{{ t("footer.warning.content") }}</p>
        </div>
        <div class="card details discord" @click="openDiscord">
          <p>
            {{ t("footer.discord") }}
            <a href="https://discord.gg/sHPp5CPxf2">Discord</a>.
          </p>
        </div>
      </div>
    </div>
    <div class="credit-wrapper">
      <p>
        <span>Better Fleet©</span> {{ t("credits.license") }} {{ date }} |
        {{ t("credits.developed") }}
        <a href="https://zelytra.fr">Zelytra</a>
        {{ t("credits.and") }}
        <a href="https://github.com/dadodasyra">dadodasyra</a> -
        {{ t("credits.designed") }}
        <a href="https://zetro.fr">ZeTro</a>
      </p>
    </div>
  </footer>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { ref } from "vue";

const version = ref(import.meta.env.VITE_VERSION);
const { t } = useI18n();
const date = ref<number>(new Date().getFullYear());

function openGithub() {
  window.open("https://github.com/zelytra/BetterFleet", "_blank");
}

function openDiscord() {
  window.open("https://discord.gg/sHPp5CPxf2", "_blank");
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
          content: "";
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

    a,
    span {
      color: var(--primary);
    }
  }

  // The footer is three columns in a row that never wrapped, and `body { overflow-x: hidden }` meant
  // it never looked broken either: at 375px the last card sat at x=677 and was simply clipped away.
  // Nothing scrolled, nothing overlapped, the GitHub link and the warning just were not there.
  @media (max-width: $lap) {
    .main-footer {
      flex-direction: column;
      align-items: center;
      padding: 40px 16px;

      .card,
      .card-wrapper {
        // flex-basis and the 300px floor are what forced the row wider than the screen; stacked, the
        // cards want the column's width and nothing else.
        flex-basis: auto;
        max-width: 520px;
      }

      .card.github {
        min-width: 0;
      }
    }
  }

  @media (max-width: $palm) {
    .main-footer {
      padding: 32px 12px;

      .card {
        padding: 20px;
        gap: 20px; // 35px of gap on a 3-line card is most of the card

        p {
          font-size: 16px;
        }
      }
    }

    .credit-wrapper {
      // This site has no global border-box, so padding on a width:100% block adds to it and runs off
      // screen. Anything given padding here has to opt in.
      box-sizing: border-box;
      padding: 16px 12px;
      text-align: center;
    }
  }
}
</style>
