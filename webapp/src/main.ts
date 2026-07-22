import { createApp, reactive } from "vue";
import "@assets/style.scss";
import "@assets/font.scss";
import App from "./App.vue";
import OverlayView from "@/components/OverlayView.vue";
import router from "@/router";
import { createI18n } from "vue-i18n";
import en from "@/assets/locales/en.json";
import fr from "@/assets/locales/fr.json";
import es from "@/assets/locales/es.json";
import de from "@/assets/locales/de.json";
import it from "@/assets/locales/it.json";
import source from "@/assets/locales/source.json";
import { AlertProvider } from "@/vue/alert/Alert.ts";
import { keycloakStore } from "@/objects/stores/LoginStates.ts";
import {
  isOverlayWindow,
  startOverlayBroadcaster,
} from "@/objects/fleet/Overlay.ts";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: { fr, en, es, de, it, source },
});

const alertProvider = reactive(new AlertProvider());

// The overlay lives in its own Tauri window (issue #671). It mounts the standalone OverlayView
// directly — no app chrome, router or auth — and is fed by the main window over Tauri events. It
// still gets i18n so it can render in the player's language (the snapshot carries the active locale).
const overlay = isOverlayWindow();
const app = createApp(overlay ? OverlayView : App);
app.use(i18n);

if (!overlay) {
  keycloakStore.init(window.location.origin);
  app.provide("alertProvider", alertProvider);
  app.directive("click-outside", {
    mounted(el, binding) {
      el.clickOutsideEvent = function (event: any) {
        if (!(el === event.target || el.contains(event.target))) {
          binding.value(event, el);
        }
      };
      window.requestAnimationFrame(() => {
        document.body.addEventListener("click", el.clickOutsideEvent);
      });
    },
    unmounted(el) {
      document.body.removeEventListener("click", el.clickOutsideEvent);
    },
  });
  app.use(router);
}

app.mount("#app");

if (!overlay) {
  // Main window: feed the overlay. Its global toggle hotkey is registered in Rust (main.rs).
  startOverlayBroadcaster();
}

export { alertProvider };
