import {createApp} from 'vue'
import "@/assets/style.scss";
import "@/assets/font.scss";
import en from "@/assets/locales/fr.json";
import fr from "@/assets/locales/fr.json";
import es from "@/assets/locales/fr.json";
import de from "@/assets/locales/fr.json";
import {createI18n} from "vue-i18n";
import App from "./App.vue";
import router from "@/router";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: {fr, en, es, de},
});

const app = createApp(App)
app.use(router);
app.use(i18n);
app.mount('#app')