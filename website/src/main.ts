import { createApp, watch } from "vue";
import "@/assets/style.scss";
import "@/assets/font.scss";
import en from "@/assets/locales/en.json";
import fr from "@/assets/locales/fr.json";
import es from "@/assets/locales/es.json";
import de from "@/assets/locales/de.json";
import it from "@/assets/locales/it.json";
import source from "@/assets/locales/source.json";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "@/router";
import VueKinesis from "vue-kinesis";
import { applyRouteMeta } from "@/objects/seo/Meta.ts";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "en", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: { fr, en, es, de, it, source },
});

const applyMeta = () =>
  applyRouteMeta(
    router.currentRoute.value,
    (key) => i18n.global.t(key),
    i18n.global.locale.value as string,
  );

// Every route shipped index.html's one title and one description, so no page could rank for what it
// is about. After the navigation rather than before, so the title only changes once the page it
// names is the one on screen.
router.afterEach(applyMeta);

// AppStore.init() picks the locale from navigator.language, and it runs from a component — i.e.
// after the first navigation has already fired. Without this, the first page a visitor lands on
// always got the English title no matter where they are, which is most of the traffic and the whole
// point of translating them.
watch(() => i18n.global.locale.value, applyMeta);

const app = createApp(App);
app.use(router);
app.use(VueKinesis);
app.use(i18n);
app.mount("#app");
