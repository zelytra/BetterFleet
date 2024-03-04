import { createApp, reactive } from "vue";
import "@assets/style.scss";
import "@assets/font.scss";
import App from "./App.vue";
import router from "@/router";
import { createI18n } from "vue-i18n";
import en from "@/assets/locales/en.json";
import fr from "@/assets/locales/fr.json";
import { AlertProvider } from "@/vue/alert/Alert.ts";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: { fr, en },
});

const app = createApp(App);
app.provide("alertProvider", reactive(new AlertProvider()));
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
app.use(i18n);
app.mount("#app");
