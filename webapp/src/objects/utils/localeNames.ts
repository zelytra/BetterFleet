// Native display names for the app's languages, shown in the settings language selector.
//
// These are constants: each language's own name, identical in every locale file. They live here
// rather than in the translatable source.json on purpose. In the JSON, Crowdin treats "Italiano" as
// a string to translate and hands back "Italienisch" (German), "Italien" (French) and so on, which
// then reverts on every sync. A name a speaker recognises must stay in that speaker's own language,
// so it is not translation data at all.
export const LOCALE_NAMES: Record<string, string> = {
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  hi: "हिन्दी",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  pl: "Polski",
  pt: "Português (Brasil)",
  ru: "Русский",
  uk: "Українська",
  zh: "简体中文",
};
