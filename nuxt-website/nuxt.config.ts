import en from "./assets/locales/en.json";
import fr from "./assets/locales/fr.json";
import es from "./assets/locales/es.json";
import de from "./assets/locales/de.json";

export default defineNuxtConfig({
    compatibilityDate: '2024-04-03',
    devtools: {enabled: true},
    modules: ['@nuxtjs/i18n'],
    css: ["@/assets/style.scss", "@/assets/font.scss"],
    i18n: {

    }
})