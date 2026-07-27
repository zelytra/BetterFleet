<script setup lang="ts">
import { useI18n } from "vue-i18n";

/**
 * A schematic drawing of the app's session lobby, shown at four moments of the alliance flow.
 *
 * It is deliberately a drawing and not a screenshot. The steps are one continuous story — the same
 * window, changing — which a set of separately-captured screenshots cannot show; it does not go
 * stale the next time the lobby is restyled; and, being HTML rather than an image, its text stays
 * at a real font size on a phone instead of shrinking with the picture. Colours are the
 * application's own tokens and the labels repeat its own wording (tutorial.ui.*), so it still reads
 * as the screen the visitor is about to open.
 */
defineProps<{
  variant: "session" | "ready" | "countdown" | "grouped";
  /** Read by screen readers in place of the drawing; the parent passes its caption. */
  label: string;
  /** Shown on the banner so a reader can tie the picture to the text. */
  code?: string;
}>();

const { t } = useI18n();

const CREW = [
  { initial: "Z", name: "Zelytra", hue: "#32d499" },
  { initial: "R", name: "Ricuju", hue: "#d47070" },
  { initial: "D", name: "Dadodasyra", hue: "#9c70d3" },
  { initial: "H", name: "Hosapuwopa", hue: "#7092d3" },
];
</script>

<template>
  <div class="mock" role="img" :aria-label="label">
    <div class="rail" aria-hidden="true">
      <span class="dot" />
      <span class="bar" />
      <span class="bar" />
      <span class="bar" />
    </div>

    <div class="body">
      <header class="banner">
        <div class="ident">
          <p class="crew">{{ t("tutorial.ui.crew") }}</p>
          <p class="code-line">
            {{ t("tutorial.ui.code") }}
            <b :class="{ ringed: variant === 'session' }">{{
              code ?? "K7X2QM"
            }}</b>
          </p>
        </div>
        <span class="invite">{{ t("tutorial.ui.invite") }}</span>
      </header>

      <!-- step 1: the session exists, the crew is arriving -->
      <template v-if="variant === 'session'">
        <p class="hint">{{ t("tutorial.ui.waiting") }}</p>
        <div class="rows">
          <div v-for="p in CREW.slice(0, 2)" :key="p.name" class="row">
            <span class="avatar" :style="{ background: p.hue }">
              {{ p.initial }}
            </span>
            <span class="name">{{ p.name }}</span>
            <span class="status">{{ t("tutorial.ui.inMenu") }}</span>
          </div>
        </div>
      </template>

      <!-- step 3: everyone marks themselves ready -->
      <template v-if="variant === 'ready'">
        <div class="rows">
          <div v-for="(p, i) in CREW" :key="p.name" class="row">
            <span class="avatar" :style="{ background: p.hue }">
              {{ p.initial }}
            </span>
            <span class="name">{{ p.name }}</span>
            <span class="status">{{ t("tutorial.ui.inMenu") }}</span>
            <span class="state" :class="i < 3 ? 'yes' : 'no'">
              {{ i < 3 ? t("tutorial.ui.ready") : t("tutorial.ui.notReady") }}
            </span>
          </div>
        </div>
        <!-- The captain's button, still out of reach: one player has not confirmed. -->
        <p class="btn-off">{{ t("tutorial.ui.start") }}</p>
      </template>

      <!-- step 4: the shared countdown -->
      <div v-if="variant === 'countdown'" class="countdown">
        <p class="cd-label">{{ t("tutorial.ui.countdown") }}</p>
        <p class="cd">3</p>
        <p class="hint">{{ t("tutorial.ui.atZero") }}</p>
      </div>

      <!-- step 5: the result — who landed together -->
      <template v-if="variant === 'grouped'">
        <section class="server">
          <p class="server-name">{{ t("tutorial.ui.server") }} 4DFG71 · 🇫🇷</p>
          <div class="rows">
            <div v-for="p in CREW.slice(0, 3)" :key="p.name" class="row">
              <span class="avatar" :style="{ background: p.hue }">
                {{ p.initial }}
              </span>
              <span class="name">{{ p.name }}</span>
              <span class="state yes">{{ t("tutorial.ui.inGame") }}</span>
            </div>
          </div>
        </section>
        <section class="server other">
          <p class="server-name">{{ t("tutorial.ui.server") }} 8FGH7B · 🇮🇪</p>
          <div class="rows">
            <div class="row">
              <span class="avatar" :style="{ background: CREW[3].hue }">
                {{ CREW[3].initial }}
              </span>
              <span class="name">{{ CREW[3].name }}</span>
              <span class="state yes">{{ t("tutorial.ui.inGame") }}</span>
            </div>
          </div>
        </section>
        <p class="hint centered">{{ t("tutorial.ui.oneShort") }}</p>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
// A plain sans, against the vitrine's Windlass: the drawing has to read as another surface — an
// application window — and not as more of the page. (The app's own Jost is 61 KB a weight, too much
// to ship for one picture, and this is a schematic, not a screenshot.) It has to be set on every
// node, not inherited: style.scss puts Windlass on `*`, which no descendant ever inherits past.
.mock,
.mock * {
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}

.mock {
  display: flex;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #171a21;
  overflow: hidden;

  .rail {
    flex: 0 0 auto;
    width: 42px;
    background: #12151b;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 9px;
    padding: 17px 0;

    .dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--primary);
      opacity: 0.9;
      margin-bottom: 14px;
    }

    .bar {
      width: 14px;
      height: 3px;
      border-radius: 2px;
      background: #3a4150;
    }
  }

  .body {
    flex: 1 1 auto;
    min-width: 0;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .banner {
    background: #222631;
    border-radius: 8px;
    padding: 10px 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;

    .crew {
      font-size: 15px;
      font-weight: 600;
      color: #fff;
    }

    .code-line {
      font-size: 11px;
      color: var(--secondary-text);
      margin-top: 3px;

      b {
        color: var(--primary);
        letter-spacing: 1px;
        margin-left: 6px;
      }

      // Step 1 is the only one where the code is the point; ring it so the eye lands there.
      b.ringed {
        border: 1.5px solid var(--primary);
        border-radius: 4px;
        padding: 1px 5px;
      }
    }

    .invite {
      flex: 0 0 auto;
      font-size: 10px;
      color: var(--primary);
      border: 1px solid var(--primary);
      border-radius: 6px;
      padding: 5px 10px;
    }
  }

  .hint {
    font-size: 11px;
    color: var(--secondary-text);

    &.centered {
      text-align: center;
    }
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  // avatar | name | status | ready state. The status is the first thing to go when space runs out.
  .row {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    background: #1c2029;
    border-radius: 6px;
    padding: 7px 10px;

    .avatar {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      font-weight: 700;
      color: #10131a;
      opacity: 0.85;
    }

    .name {
      font-size: 12px;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status {
      font-size: 11px;
      color: var(--secondary-text);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .state {
      font-size: 11px;
      white-space: nowrap;
      display: flex;
      align-items: center;
      gap: 6px;

      &:after {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 50%;
        background: currentColor;
      }

      &.yes {
        color: var(--primary);
      }

      &.no {
        color: var(--important);
      }
    }
  }

  .btn-off {
    align-self: center;
    margin-top: 4px;
    padding: 8px 26px;
    border-radius: 8px;
    background: #222631;
    border: 1px solid #3a4150;
    color: #6c7484;
    font-size: 11px;
  }

  .countdown {
    background: #1c2029;
    border-radius: 8px;
    padding: 30px 16px 26px;
    text-align: center;

    .cd-label {
      font-size: 12px;
      letter-spacing: 3px;
      color: var(--secondary-text);
      text-transform: uppercase;
    }

    .cd {
      font-size: 64px;
      font-weight: 800;
      line-height: 1.1;
      color: var(--primary);
      margin: 6px 0 4px;
    }
  }

  .server {
    border-radius: 8px;
    padding: 10px;
    background: #1a2b26;
    border: 1.5px solid var(--primary);

    .server-name {
      text-align: center;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 8px;
    }

    // Second server: the same card in the blue the app uses for a group you are not part of.
    &.other {
      background: #1a2230;
      border-color: #286aa8;

      .server-name {
        color: #6ba6e0;
      }
    }

    // Inside a server card the status column is redundant — everyone there is in the game.
    .row {
      grid-template-columns: 18px minmax(0, 1fr) auto;
    }
  }
}

// A phone has no room for the app's chrome or for a column that says the same thing on every line.
@media (max-width: $palm) {
  .mock {
    .rail {
      display: none;
    }

    .body {
      padding: 10px;
      gap: 8px;
    }

    .banner {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
      padding: 10px;
    }

    .row {
      grid-template-columns: 18px minmax(0, 1fr) auto;

      .status {
        display: none;
      }
    }

    .countdown .cd {
      font-size: 52px;
    }
  }
}
</style>
