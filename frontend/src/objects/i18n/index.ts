import { createI18n } from "vue-i18n";
import fr from "@assets/locales/fr.json";
import en from "@assets/locales/en.json";

export default createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: { fr, en },
});
