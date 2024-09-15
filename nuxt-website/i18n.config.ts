import fr from "assets/locales/fr.json";
import en from "assets/locales/en.json";
import es from "assets/locales/es.json";
import de from "assets/locales/de.json";

export default defineI18nConfig(() => ({
    legacy: false,
    locale: "fr", // set locale
    fallbackLocale: "en", // set fallback locale
    messages: {fr, en, es, de},
}))
