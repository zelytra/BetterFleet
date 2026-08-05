// Renders the real FleetLobby at the four moments the website tutorial illustrates, so the page can
// ship actual screenshots of the application rather than a drawing of it.
//
//   ?shot=session|ready|countdown|grouped   which moment
//   ?lang=fr|en|es|de|it                    which locale
//
// Nothing here fakes UI: the components, styles and translations are the app's own. Only the state
// they render is fabricated, because reaching it for real needs four accounts, a backend and luck.
import { createApp, reactive } from "vue";
import "@assets/style.scss";
import "@assets/font.scss";
import { createI18n } from "vue-i18n";
import fr from "@/assets/locales/fr.json";
import en from "@/assets/locales/en.json";
import es from "@/assets/locales/es.json";
import de from "@/assets/locales/de.json";
import it from "@/assets/locales/it.json";
import AppShell from "./AppShell.vue";
import { Fleet } from "@/objects/fleet/Fleet.ts";
import { UserStore } from "@/objects/stores/UserStore.ts";
import {
  BoatSize,
  Player,
  PlayerDevice,
  PlayerStates,
} from "@/objects/fleet/Player.ts";
import { SotServer } from "@/objects/fleet/SotServer.ts";
import { sessionRecap } from "@/objects/fleet/SessionRecap.ts";
import { LocalTime } from "@js-joda/core";
import { Utils } from "@/objects/utils/Utils.ts";
import router from "@/router";

const params = new URLSearchParams(location.search);
const shot = params.get("shot") ?? "session";
const lang = params.get("lang") ?? "fr";

// The avatar colour is Math.random() per render in the real app, which would give every shot a
// different palette. Keyed by name instead, so a pirate keeps their colour across the four pictures.
const AVATAR: Record<string, string> = {
  Zelytra: "#32d49980",
  Ricuju: "#d4707080",
  Dadodasyra: "#9c70d380",
  Hosapuwopa: "#7092d380",
};
let avatarCursor = 0;
const AVATAR_ORDER = Object.values(AVATAR);
Utils.generateRandomColor = () =>
  AVATAR_ORDER[avatarCursor++ % AVATAR_ORDER.length];

function player(username: string, over: Partial<Player> = {}): Player {
  return {
    username,
    status: PlayerStates.MAIN_MENU,
    isReady: false,
    isMaster: false,
    device: PlayerDevice.MICROSOFT,
    boatSize: BoatSize.SLOOP,
    lang,
    soundEnable: true,
    soundLevel: 30,
    macroEnable: true,
    banner: 0,
    bannerShuffle: false,
    shareStats: true,
    ...over,
  } as Player;
}

const fleet = new Fleet();
fleet.sessionId = "k7x2qm";
fleet.customName = "";
fleet.sessionName = "The Kraken's Crew";
fleet.isPrivate = false;
fleet.banner = 2;
fleet.autoSetSail = false;

const zelytra = player("Zelytra", { isMaster: true });
const ricuju = player("Ricuju");
const dadodasyra = player("Dadodasyra", { device: PlayerDevice.XBOX });
const hosapuwopa = player("Hosapuwopa", { device: PlayerDevice.PLAYSTATION });

function server(
  hash: string,
  color: string,
  location: string,
  players: Player[],
): [string, SotServer] {
  return [
    hash,
    {
      ip: "20.61.44." + (100 + players.length),
      port: 30271,
      location,
      color,
      connectedPlayers: players,
    },
  ];
}

switch (shot) {
  // 1: the session exists, its code is on the banner, crewmates are arriving.
  case "session": {
    fleet.players = [zelytra, ricuju];
    fleet.stats = { tryAmount: 0, successPrediction: 0 };
    break;
  }
  // 3: everyone has declared themselves, one player has not.
  case "ready": {
    zelytra.isReady = true;
    ricuju.isReady = true;
    dadodasyra.isReady = true;
    fleet.players = [zelytra, ricuju, dadodasyra, hosapuwopa];
    fleet.stats = { tryAmount: 2, successPrediction: 0 };
    break;
  }
  // 4: the shared countdown, over the lobby.
  case "countdown": {
    for (const p of [zelytra, ricuju, dadodasyra, hosapuwopa]) p.isReady = true;
    fleet.players = [zelytra, ricuju, dadodasyra, hosapuwopa];
    fleet.stats = { tryAmount: 2, successPrediction: 0 };
    break;
  }
  // 5: the result: who landed on which server, and the recap card over the win.
  case "grouped": {
    for (const p of [zelytra, ricuju, dadodasyra, hosapuwopa]) {
      p.isReady = true;
      p.status = PlayerStates.IN_GAME;
    }
    fleet.players = [zelytra, ricuju, dadodasyra, hosapuwopa];
    fleet.stats = { tryAmount: 3, successPrediction: 0 };
    fleet.servers = new Map([
      server("4dfg71", "#32D499", "France", [zelytra, ricuju, dadodasyra]),
      server("8fgh7b", "#4E9BE0", "Ireland", [hosapuwopa]),
    ]);
    sessionRecap.visible = true;
    sessionRecap.data = {
      tries: 3,
      players: 3,
      durationMs: 14 * 60 * 1000 + 32 * 1000,
      countryCode: "fr",
    };
    break;
  }
}

UserStore.player = reactive(
  player("Zelytra", {
    isMaster: true,
    isReady: shot !== "session",
    status: shot === "grouped" ? PlayerStates.IN_GAME : PlayerStates.MAIN_MENU,
    // The best-window hint fetches from a backend that is not running here; off, so the shot does
    // not depend on a request that will fail.
    statsHint: false,
    fleet,
  }),
) as never;

if (shot === "countdown") {
  UserStore.player.countDown = { clickTime: LocalTime.now().plusSeconds(5) };
}

const app = createApp(AppShell, { session: fleet });
app.use(
  createI18n({
    legacy: false,
    locale: lang,
    fallbackLocale: "en",
    messages: { fr, en, es, de, it } as never,
  }),
);
app.use(router);
app.provide("alertProvider", {
  sendAlert: (alert: unknown) => console.log("[alert]", alert),
});
app.directive("click-outside", {});
app.mount("#app");
