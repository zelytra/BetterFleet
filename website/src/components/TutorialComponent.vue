<script setup lang="ts">
import { useI18n } from "vue-i18n";
import SeparatorVue from "@/vue/SeparatorVue.vue";
import PirateButton from "@/vue/PirateButton.vue";
import LobbyMockup from "@/vue/tutorial/LobbyMockup.vue";
import { AppStore } from "@/objects/stores/appStore.ts";
import { incrementDownload } from "@/objects/Stats.ts";

const { t } = useI18n();

// Five steps, each paired with the moment of the lobby it belongs to. Step 2 carries no picture on
// purpose: it happens in Sea of Thieves, not in BetterFleet, and drawing the game here would blur
// the line between what the app does and what the player does.
const STEPS = [
  { n: 1, shot: "session" as const },
  { n: 2, shot: null },
  { n: 3, shot: "ready" as const },
  { n: 4, shot: "countdown" as const },
  { n: 5, shot: "grouped" as const },
];
</script>

<template>
  <section class="tutorial">
    <header class="hero">
      <p class="eyebrow">{{ t("tutorial.eyebrow") }}</p>
      <h1>{{ t("tutorial.title") }}</h1>
      <p class="lead">{{ t("tutorial.lead") }}</p>
    </header>

    <SeparatorVue />

    <div class="wrap">
      <!-- What the whole thing is for. Kept short: the reader came here to do something. -->
      <section class="prose">
        <h2>{{ t("tutorial.whatIsIt.title") }}</h2>
        <p>{{ t("tutorial.whatIsIt.content") }}</p>
        <p>{{ t("tutorial.whatIsIt.role") }}</p>
      </section>

      <!-- What they need before starting, so nobody discovers a blocker at step 4. -->
      <section class="needs">
        <h2>{{ t("tutorial.needs.title") }}</h2>
        <ul>
          <li v-for="n in 3" :key="n">{{ t("tutorial.needs.item" + n) }}</li>
        </ul>
      </section>

      <section class="steps">
        <h2 class="steps-title">{{ t("tutorial.steps.title") }}</h2>

        <article v-for="step in STEPS" :key="step.n" class="step">
          <div class="text">
            <span class="num">{{ step.n }}</span>
            <div>
              <h3>{{ t("tutorial.step." + step.n + ".title") }}</h3>
              <p>{{ t("tutorial.step." + step.n + ".content") }}</p>
              <!-- Console players are the one audience this page cannot finish serving: the rest
                   of the steps assume a PC, so send them to the guide written for them. -->
              <p v-if="step.n === 1" class="aside">
                {{ t("tutorial.step.1.console") }}
                <router-link to="/console">
                  {{ t("presentation.joinConsole") }} →
                </router-link>
              </p>
              <p v-if="step.n === 5" class="aside">
                {{ t("tutorial.step.5.again") }}
              </p>
            </div>
          </div>
          <figure v-if="step.shot">
            <LobbyMockup
              :variant="step.shot"
              :label="t('tutorial.shot.' + step.shot)"
            />
            <figcaption>{{ t("tutorial.shot." + step.shot) }}</figcaption>
          </figure>
        </article>
      </section>

      <!-- Expectation-setting. The biggest source of disappointment is believing one countdown is
           meant to work, so it is said plainly here rather than left in the FAQ. -->
      <section class="reality">
        <h2>{{ t("tutorial.reality.title") }}</h2>
        <p>{{ t("tutorial.reality.content") }}</p>
        <ul>
          <li v-for="n in 3" :key="n">{{ t("tutorial.reality.tip" + n) }}</li>
        </ul>
      </section>
    </div>

    <footer class="cta">
      <h2>{{ t("tutorial.cta.title") }}</h2>
      <p>{{ t("tutorial.cta.content") }}</p>
      <div class="actions">
        <!-- Same split as the home hero (#670): the installer is Windows-only, so below $lap it
             gives way to the one action a phone can actually take — joining a crew's session. -->
        <a
          v-if="AppStore.githubRelease.url"
          class="download-cta"
          :href="AppStore.githubRelease.url"
          target="_blank"
        >
          <PirateButton
            :label="t('button.downloadApp')"
            @on-button-click="incrementDownload"
          />
        </a>
        <router-link class="btn" to="/s">
          {{ t("nav.joinSession") }}
        </router-link>
      </div>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.tutorial {
  .hero {
    padding: 72px 24px 40px;
    text-align: center;
    position: relative;
    z-index: 0;

    &:before {
      content: " ";
      position: absolute;
      inset: 0;
      z-index: -1;
      opacity: 0.55;
      // The page's own art, kept from the previous design: a 4:1 panorama, which is the shape of
      // this hero band, where the home page's portrait background would have to be cropped. The
      // veil on top is not decoration — it is a bright sunset, and the eyebrow is a thin green on it.
      background:
        linear-gradient(180deg, rgba(10, 12, 16, 0.5), rgba(10, 12, 16, 0.3)),
        url("@assets/backgrounds/tutorial.png") no-repeat 50% 50%;
      background-size: auto, cover;
      mask-image: linear-gradient(180deg, #000 40%, transparent 100%);
      -webkit-mask-image: linear-gradient(180deg, #000 40%, transparent 100%);
    }

    .eyebrow {
      color: var(--primary);
      font-size: 13px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    h1 {
      font-size: 44px;
      margin-bottom: 16px;
      text-wrap: balance;
    }

    .lead {
      color: var(--secondary-text);
      font-size: 18px;
      max-width: 56ch;
      margin: 0 auto;
      line-height: 1.6;
    }
  }

  .wrap {
    max-width: 900px;
    margin: 0 auto;
    padding: 8px 24px 0;
  }

  h2 {
    font-size: 26px;
    margin-bottom: 14px;
    text-wrap: balance;
  }

  .prose,
  .needs,
  .reality {
    margin: 48px 0;

    p {
      color: var(--secondary-text);
      line-height: 1.7;
      margin-bottom: 12px;
      max-width: 68ch;
    }
  }

  .needs,
  .reality {
    ul {
      list-style: none;
      padding: 0;
      margin-top: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    li {
      position: relative;
      padding-left: 26px;
      color: var(--secondary-text);
      line-height: 1.6;
      max-width: 68ch;

      &:before {
        content: "⚓";
        position: absolute;
        left: 0;
        font-size: 13px;
        color: var(--primary);
      }
    }
  }

  .steps {
    margin: 56px 0;

    .steps-title {
      margin-bottom: 32px;
    }

    .step {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 28px 0;
      border-top: 1px solid rgba(255, 255, 255, 0.08);

      .text {
        display: flex;
        gap: 18px;
        align-items: flex-start;
      }

      // The number is the spine of the page: same size, same colour, always at the left edge.
      .num {
        flex: 0 0 auto;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        border: 1.5px solid var(--primary);
        color: var(--primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 600;
      }

      h3 {
        font-size: 20px;
        margin-bottom: 8px;
      }

      p {
        color: var(--secondary-text);
        line-height: 1.7;
        max-width: 62ch;
      }

      .aside {
        margin-top: 10px;
        padding-left: 14px;
        border-left: 2px solid var(--primary);
        font-size: 15px;

        a {
          color: var(--primary);
          white-space: nowrap;
        }
      }

      figure {
        margin: 0 0 0 52px;

        figcaption {
          margin-top: 10px;
          font-size: 13px;
          color: var(--secondary-text);
          font-style: italic;
        }
      }
    }
  }

  .cta {
    margin-top: 24px;
    padding: 56px 24px 72px;
    text-align: center;
    background: var(--secondary-background);

    p {
      color: var(--secondary-text);
      max-width: 52ch;
      margin: 0 auto 24px;
      line-height: 1.6;
    }

    .actions {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .btn {
      min-height: 50px;
      padding: 0 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      text-decoration: none;
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--primary-text);
    }
  }

  @media (max-width: $lap) {
    .hero {
      padding: 48px 18px 32px;

      h1 {
        font-size: 34px;
      }

      .lead {
        font-size: 16px;
      }
    }

    .wrap {
      padding: 8px 18px 0;
    }

    h2 {
      font-size: 22px;
    }

    // Below this width the picture cannot keep the number's indent and stay readable.
    .steps .step figure {
      margin-left: 0;
    }

    .cta {
      padding: 44px 18px 56px;

      // Windows installer: nothing a phone or tablet can do with it (#670).
      .download-cta {
        display: none;
      }

      .actions {
        flex-direction: column;
      }

      .btn {
        width: 100%;
        max-width: 340px;
        box-sizing: border-box;
        background: var(--primary);
        border-color: transparent;
        color: #0b241b;
        font-weight: 600;
      }
    }
  }

  @media (max-width: $palm) {
    .hero h1 {
      font-size: 28px;
    }

    .steps .step {
      .text {
        gap: 12px;
      }

      .num {
        width: 28px;
        height: 28px;
        font-size: 14px;
      }

      h3 {
        font-size: 18px;
      }
    }
  }
}
</style>
