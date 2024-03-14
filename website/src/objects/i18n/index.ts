import { createI18n } from "vue-i18n";
import fr from "@assets/locales/fr.json";
import en from "@assets/locales/fr.json";
import es from "@assets/locales/fr.json";
import de from "@assets/locales/fr.json";
import source from "@assets/locales/source.json";

export const i18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: import.meta.env.VITE_DEBUG as boolean ? "source" : "fr", // set locale
  fallbackLocale: "fr", // set fallback locale
  messages: {fr, en, es, de, source},
});

if(JSON.parse(import.meta.env.VITE_DEBUG)){
  i18n.global.locale.value = "source"
}

