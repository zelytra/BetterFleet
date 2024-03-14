import {createApp} from 'vue'
import "@/assets/style.scss";
import "@/assets/font.scss";
import en from "@/assets/locales/fr.json";
import fr from "@/assets/locales/fr.json";
import source from "@/assets/locales/source.json";
import es from "@/assets/locales/fr.json";
import de from "@/assets/locales/fr.json";
import {createI18n} from "vue-i18n";
import App from "./App.vue";
import router from "@/router";
import VueKinesis from "vue-kinesis";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: {fr, en, es, de, source},
});

if(JSON.parse(import.meta.env.VITE_DEBUG)){
  i18n.global.locale.value = "source"
}

const app = createApp(App)
app.use(router);
app.use(VueKinesis);
app.use(i18n);
app.mount('#app')
