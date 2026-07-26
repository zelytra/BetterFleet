<template>
  <section class="console-guide">
    <header>
      <img class="logo" :src="logo" alt="BetterFleet" />
      <h1>{{ t("consoleGuide.title") }}</h1>
      <p class="intro">{{ t("consoleGuide.intro") }}</p>
    </header>

    <ol class="steps">
      <li v-for="n in 5" :key="n">
        <span class="num">{{ n }}</span>
        <p>{{ t("consoleGuide.step" + n) }}</p>
      </li>
    </ol>

    <p class="note">{{ t("consoleGuide.note") }}</p>

    <div class="actions">
      <!-- Step 3 tells the reader to come to the site and enter their code; this is that screen,
           one tap away, so they do not have to go hunting for it in the menu. -->
      <router-link class="btn primary" to="/s">
        {{ t("nav.joinSession") }}
      </router-link>
      <a class="btn ghost" href="https://discord.gg/sHPp5CPxf2" target="_blank">
        {{ t("discover.discord.button") }}
      </a>
    </div>
  </section>
</template>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import logo from "@/assets/icons/logo.svg";

const { t } = useI18n();
</script>

<style scoped lang="scss">
.console-guide {
  max-width: 640px;
  margin: 0 auto;
  padding: 32px 18px 48px;
  color: var(--primary-text);

  header {
    text-align: center;
    margin-bottom: 24px;

    .logo {
      width: 60px;
      height: 60px;
      margin-bottom: 8px;
    }

    h1 {
      margin: 0;
      font-size: 28px;
    }

    .intro {
      color: var(--secondary-text);
      margin: 8px auto 0;
      max-width: 480px;
    }
  }

  .steps {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;

    li {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      background: var(--secondary-background);
      border-radius: 12px;
      padding: 14px 16px;

      .num {
        flex-shrink: 0;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        background: var(--primary);
        color: #05231a;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    }
  }

  .note {
    color: var(--secondary-text);
    text-align: center;
    margin: 24px 0 0;
  }

  .actions {
    display: flex;
    justify-content: center;
    // Two actions now, and this page is read on phones: let them stack rather than shrink.
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;

    .btn {
      min-height: 50px;
      padding: 0 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      text-decoration: none;
      font-weight: 600;
    }

    .btn.primary {
      background: var(--primary);
      color: #0b241b;
      border: none;
    }

    .btn.ghost {
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: var(--primary-text);
      font-weight: 400;
    }
  }
}
</style>
