<template>
  <section class="mobile-lobby">
    <!-- Full-screen "set sail" moment: readable from the sofa (#682). -->
    <div v-if="countdownEndsAt" class="countdown">
      <p class="label">{{ t("mobileLobby.countdown.label") }}</p>
      <p class="value">
        {{ remaining > 0 ? remaining : t("mobileLobby.countdown.go") }}
      </p>
    </div>

    <!-- Session ended: the app crew left (backend disbanded it) or the link dropped. -->
    <div v-if="isEnded" class="ended">
      <img class="logo" :src="logo" alt="BetterFleet" />
      <h1>{{ t("mobileLobby.ended.title") }}</h1>
      <p class="sub">{{ t("mobileLobby.ended.text") }}</p>
      <button type="button" class="btn primary" @click="restart()">
        {{ t("mobileLobby.ended.again") }}
      </button>
    </div>

    <!-- Join form: shown until we're live in the lobby. -->
    <div v-else-if="!isLive" class="join">
      <img class="logo" :src="logo" alt="BetterFleet" />
      <h1>{{ t("mobileLobby.join.title") }}</h1>
      <p class="sub">{{ t("mobileLobby.join.subtitle") }}</p>

      <label>{{ t("mobileLobby.join.code") }}</label>
      <input
        v-model="code"
        class="field mono"
        maxlength="7"
        autocapitalize="characters"
        :placeholder="t('mobileLobby.join.codePlaceholder')"
      />

      <label>{{ t("mobileLobby.join.username") }}</label>
      <input
        v-model="username"
        class="field"
        maxlength="16"
        :placeholder="t('mobileLobby.join.usernamePlaceholder')"
      />

      <label>{{ t("mobileLobby.join.device") }}</label>
      <div class="device-pick">
        <button
          type="button"
          :class="{ active: device === 'XBOX' }"
          @click="device = 'XBOX'"
        >
          Xbox
        </button>
        <button
          type="button"
          :class="{ active: device === 'PLAYSTATION' }"
          @click="device = 'PLAYSTATION'"
        >
          PlayStation
        </button>
      </div>

      <p v-if="errorKey" class="error">{{ t(errorKey) }}</p>

      <button
        type="button"
        class="btn primary"
        :disabled="!canJoin"
        @click="join()"
      >
        {{
          lobby.status === "connecting"
            ? t("mobileLobby.join.connecting")
            : t("mobileLobby.join.button")
        }}
      </button>
    </div>

    <!-- Live lobby. -->
    <div v-else class="live">
      <header>
        <p class="name">{{ lobby.sessionName }}</p>
        <p class="count">
          {{ readyCount }} / {{ lobby.players.length }}
          {{ t("mobileLobby.readyCount") }}
        </p>
      </header>

      <div class="groups">
        <div v-for="server in lobby.servers" :key="server.hash" class="server">
          <p class="server-head">
            <span class="dot" :style="{ background: server.color }" />
            <span class="where">{{ server.location || server.hash }}</span>
            <span v-if="flag(server.countryCode)" class="flag">{{
              flag(server.countryCode)
            }}</span>
          </p>
          <div
            v-for="p in server.connectedPlayers"
            :key="p.username"
            :class="{ row: true, self: p.username === lobby.me }"
          >
            <span class="badge">{{ deviceLabel(p.device) }}</span>
            <span class="pseudo">{{ p.username }}</span>
            <span :class="{ state: true, ready: p.isReady }">{{
              p.isReady ? "✓" : "…"
            }}</span>
          </div>
        </div>

        <div v-if="ungrouped.length" class="server">
          <p class="server-head muted">{{ t("mobileLobby.noServer") }}</p>
          <div
            v-for="p in ungrouped"
            :key="p.username"
            :class="{ row: true, self: p.username === lobby.me }"
          >
            <span class="badge">{{ deviceLabel(p.device) }}</span>
            <span class="pseudo">{{ p.username }}</span>
            <span :class="{ state: true, ready: p.isReady }">{{
              p.isReady ? "✓" : "…"
            }}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        :class="{ ready: true, on: lobby.isReady }"
        @click="toggleReady()"
      >
        {{
          lobby.isReady ? t("mobileLobby.imReady") : t("mobileLobby.imNotReady")
        }}
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import logo from "@/assets/icons/logo.svg";
import {
  ConsoleDevice,
  joinLobby,
  leaveLobby,
  lobby,
  toggleReady,
} from "@/objects/session/MobileSession.ts";

const { t } = useI18n();
const route = useRoute();

const code = ref((route.params.code as string)?.toUpperCase() ?? "");
const username = ref("");
const device = ref<ConsoleDevice>("XBOX");

const isLive = computed(() => lobby.status === "connected");
const isEnded = computed(() => lobby.status === "closed");

function restart() {
  leaveLobby();
}
const canJoin = computed(
  () =>
    lobby.status !== "connecting" &&
    code.value.trim().length > 0 &&
    username.value.trim().length > 0,
);
const errorKey = computed(() => {
  switch (lobby.status) {
    case "not_found":
      return "mobileLobby.error.notFound";
    case "refused":
      return "mobileLobby.error.refused";
    case "error":
      return "mobileLobby.error.generic";
    default:
      return "";
  }
});

const readyCount = computed(
  () => lobby.players.filter((p) => p.isReady).length,
);
const ungrouped = computed(() => {
  const assigned = new Set(
    lobby.servers.flatMap((s) => s.connectedPlayers.map((p) => p.username)),
  );
  return lobby.players.filter((p) => !assigned.has(p.username));
});

// Tick the countdown locally off the synced end time (#671 pattern), so it stays smooth.
const now = ref(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  ticker = setInterval(() => (now.value = Date.now()), 250);
});
onUnmounted(() => {
  if (ticker) clearInterval(ticker);
  leaveLobby();
});
const countdownEndsAt = computed(() => lobby.countdownEndsAt);
const remaining = computed(() =>
  countdownEndsAt.value
    ? Math.max(0, Math.ceil((countdownEndsAt.value - now.value) / 1000))
    : 0,
);

function deviceLabel(dev?: string): string {
  if (dev === "PLAYSTATION") return "PS";
  if (dev === "XBOX") return "Xbox";
  return "PC";
}

function flag(countryCode?: string): string {
  if (!countryCode || !/^[a-zA-Z]{2}$/.test(countryCode)) return "";
  const base = 0x1f1e6;
  const cc = countryCode.toUpperCase();
  return String.fromCodePoint(
    base + (cc.charCodeAt(0) - 65),
    base + (cc.charCodeAt(1) - 65),
  );
}

function join() {
  joinLobby(code.value, username.value, device.value);
}
</script>

<style scoped lang="scss">
.mobile-lobby {
  min-height: 100dvh;
  max-width: 520px;
  margin: 0 auto;
  padding: 24px 18px 32px;
  box-sizing: border-box;
  color: var(--primary-text);

  .join {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .logo {
      width: 56px;
      height: 56px;
      margin: 8px auto 4px;
    }

    h1 {
      text-align: center;
      margin: 0;
      font-size: 26px;
    }

    .sub {
      text-align: center;
      color: var(--secondary-text);
      margin: 0 0 12px;
    }

    label {
      font-size: 13px;
      color: var(--secondary-text);
      margin-top: 8px;
    }

    .field {
      min-height: 48px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: var(--secondary-background);
      color: var(--primary-text);
      font-size: 16px;

      &.mono {
        letter-spacing: 3px;
        text-transform: uppercase;
      }

      &:focus {
        outline: none;
        border-color: var(--primary);
      }
    }

    .device-pick {
      display: flex;
      gap: 10px;

      button {
        flex: 1;
        min-height: 48px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: var(--secondary-background);
        color: var(--secondary-text);
        font-size: 15px;
        cursor: pointer;

        &.active {
          border-color: var(--primary);
          color: var(--primary-text);
        }
      }
    }

    .error {
      color: var(--important);
      font-size: 14px;
      margin: 4px 0 0;
    }

    .btn.primary {
      margin-top: 16px;
      min-height: 52px;
      border: none;
      border-radius: 12px;
      background: var(--primary);
      color: #05231a;
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }
  }

  .ended {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 6px;
    padding-top: 48px;

    .logo {
      width: 56px;
      height: 56px;
    }

    h1 {
      margin: 8px 0 0;
      font-size: 24px;
    }

    .sub {
      color: var(--secondary-text);
      margin: 0 0 8px;
    }

    .btn.primary {
      margin-top: 12px;
      min-height: 52px;
      padding: 0 28px;
      border: none;
      border-radius: 12px;
      background: var(--primary);
      color: #05231a;
      font-size: 17px;
      font-weight: 700;
      cursor: pointer;
    }
  }

  .live {
    display: flex;
    flex-direction: column;
    gap: 14px;

    header {
      text-align: center;

      .name {
        font-size: 22px;
        font-weight: 700;
        margin: 4px 0 2px;
      }

      .count {
        color: var(--secondary-text);
        margin: 0;
      }
    }

    .groups {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .server {
      background: var(--secondary-background);
      border-radius: 12px;
      padding: 10px 12px;

      .server-head {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0 0 8px;
        font-size: 14px;
        font-weight: 600;

        &.muted {
          color: var(--secondary-text);
          font-weight: 500;
        }

        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .where {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 4px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);

        &.self .pseudo {
          color: var(--primary);
          font-weight: 600;
        }

        .badge {
          font-size: 11px;
          padding: 2px 7px;
          border-radius: 6px;
          background: rgba(255, 255, 255, 0.08);
          color: var(--secondary-text);
          flex-shrink: 0;
        }

        .pseudo {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .state {
          color: var(--secondary-text);

          &.ready {
            color: var(--primary);
          }
        }
      }
    }

    button.ready {
      position: sticky;
      bottom: 16px;
      min-height: 60px;
      border: none;
      border-radius: 14px;
      background: var(--secondary-background);
      border: 2px solid var(--primary);
      color: var(--primary);
      font-size: 18px;
      font-weight: 700;
      cursor: pointer;

      &.on {
        background: var(--primary);
        color: #05231a;
      }
    }
  }

  .countdown {
    position: fixed;
    inset: 0;
    z-index: 10;
    background: var(--primary-background-static);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;

    .label {
      color: var(--secondary-text);
      font-size: 18px;
      letter-spacing: 2px;
      text-transform: uppercase;
      margin: 0;
    }

    .value {
      color: var(--primary);
      font-size: 34vw;
      font-weight: 800;
      line-height: 1;
      margin: 0;
    }
  }
}
</style>
