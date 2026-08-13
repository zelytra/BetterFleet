import { createI18n } from "vue-i18n";
import fr from "@assets/locales/fr.json";
import en from "@assets/locales/en.json";
import es from "@assets/locales/es.json";
import de from "@assets/locales/de.json";
import it from "@assets/locales/it.json";
import hi from "@assets/locales/hi.json";
import ja from "@assets/locales/ja.json";
import ko from "@assets/locales/ko.json";
import pl from "@assets/locales/pl.json";
import pt from "@assets/locales/pt.json";
import ru from "@assets/locales/ru.json";
import uk from "@assets/locales/uk.json";
import zh from "@assets/locales/zh.json";
import source from "@assets/locales/source.json";

// The instance every non-component file translates through (alerts raised from Fleet.ts, HTTPAxios,
// the auth store, the loopback success page). It MUST carry the same languages as the app instance
// in main.ts: it used to load five, so a player in any of the other eight got their whole UI
// translated except the strings raised from TypeScript, which silently fell back to English.
// UserStore.setLang drives both instances, so the message sets have to match.
export const tsi18n = createI18n({
  legacy: false, // you must set `false`, to use Composition API
  locale: "fr", // set locale
  fallbackLocale: "en", // set fallback locale
  messages: { fr, en, es, de, it, hi, ja, ko, pl, pt, ru, uk, zh, source },
});

export default tsi18n;
