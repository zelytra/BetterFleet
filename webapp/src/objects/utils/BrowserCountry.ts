/**
 * The player's country as a lowercase ISO 3166-1 alpha-2 code, derived from the browser locale to
 * drive the session-owner flag in the public browser (issue #672).
 *
 * Prefers the region subtag of the locale (`en-US` → `us`, `pt-BR` → `br`). For a bare locale it
 * falls back to a language→country guess: most language codes happen to match their country
 * (`fr` → `fr`), but some don't — notably English, which has no country, so it defaults to `gb`
 * rather than render a broken flag. Returns "" when nothing sensible can be derived.
 */
export function browserCountry(
  locale: string = typeof navigator !== "undefined" ? navigator.language : "",
): string {
  if (!locale) return "";
  const [lang, region] = locale.toLowerCase().split("-");
  // A 2-letter region subtag is an ISO country code; longer subtags are scripts (e.g. `Hans`).
  if (region && region.length === 2) return region;

  const langToCountry: Record<string, string> = {
    en: "gb",
    ja: "jp",
    ko: "kr",
    zh: "cn",
    cs: "cz",
    da: "dk",
    el: "gr",
    sv: "se",
    uk: "ua",
    nb: "no",
    nn: "no",
  };
  return langToCountry[lang] ?? (lang.length === 2 ? lang : "");
}
