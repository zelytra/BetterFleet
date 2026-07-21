import { describe, expect, it } from "vitest";
import source from "@/assets/locales/source.json";
import en from "@/assets/locales/en.json";
import fr from "@/assets/locales/fr.json";
import de from "@/assets/locales/de.json";
import es from "@/assets/locales/es.json";
// Aliased: vitest's it() owns that name here.
import italian from "@/assets/locales/it.json";

/**
 * Guards the locale files against the way i18n actually breaks here: silently.
 *
 * A key that doesn't resolve renders as its own path — "session.connectedPlayers" sitting in the
 * UI where a label should be — and nothing fails. We shipped exactly that: a second "player" key in
 * the session block quietly won (in JSON the last duplicate does), taking the label with it, and it
 * survived because nothing could see it.
 *
 * So this reads the source rather than trusting it: every t("...") in the app must resolve in every
 * locale. Part of #603.
 */

// Vite reads the sources at transform time, which keeps this free of node builtins — the app has no
// @types/node, and vue-tsc typechecks the specs.
const sources = import.meta.glob("@/**/*.{vue,ts}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const locales = { source, en, fr, de, es, it: italian } as unknown as Record<
  string,
  Record<string, unknown>
>;
const LOCALE_NAMES = Object.keys(locales);

function flatten(
  obj: Record<string, unknown>,
  prefix = "",
  out = new Set<string>(),
): Set<string> {
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") {
      flatten(value as Record<string, unknown>, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

const keysOf: Record<string, Set<string>> = Object.fromEntries(
  LOCALE_NAMES.map((name) => [name, flatten(locales[name])]),
);

// t("a.b") / $t('a.b'). A key built by concatenation — t("session.name." + seed) — has a data
// suffix, so its prefix is what gets checked instead.
const LITERAL_KEY = /\$?\bt\(\s*["']([a-zA-Z][\w.]*)["']\s*[),]/g;
const DYNAMIC_PREFIX = /\$?\bt\(\s*["']([a-zA-Z][\w.]*\.)["']\s*\+/g;

function collect(pattern: RegExp): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const [file, text] of Object.entries(sources)) {
    if (/\.spec\.ts$/.test(file)) continue;
    for (const match of text.matchAll(pattern)) {
      found.set(match[1], [...(found.get(match[1]) ?? []), file]);
    }
  }
  return found;
}

const literalKeys = collect(LITERAL_KEY);
const dynamicPrefixes = collect(DYNAMIC_PREFIX);

describe("locale files", () => {
  it("actually finds the keys the app uses", () => {
    // A guard that quietly stops matching guards nothing.
    expect(Object.keys(sources).length).toBeGreaterThan(30);
    expect(literalKeys.size).toBeGreaterThan(100);
    expect(dynamicPrefixes.size).toBeGreaterThan(0);
  });

  it.each(LOCALE_NAMES)("resolves every t() key in %s", (locale) => {
    const missing = [...literalKeys]
      .filter(([key]) => !keysOf[locale].has(key))
      .map(([key, where]) => `${key}  (used in ${where.join(", ")})`);

    expect(missing, `keys missing from ${locale}.json`).toEqual([]);
  });

  it.each(LOCALE_NAMES)(
    "has something under every dynamic prefix in %s",
    (locale) => {
      const missing = [...dynamicPrefixes]
        .filter(
          ([prefix]) => ![...keysOf[locale]].some((k) => k.startsWith(prefix)),
        )
        .map(([prefix, where]) => `${prefix}*  (used in ${where.join(", ")})`);

      expect(missing, `prefixes with no keys in ${locale}.json`).toEqual([]);
    },
  );

  // en.json is written by CI as a copy of source.json (.github/workflows/crowdin.yml), and Crowdin
  // is told not to treat English as a translation. If these diverge, one of those two is broken and
  // English is drifting from the original.
  it("keeps en.json and source.json on the same keys", () => {
    expect([...keysOf.en].sort()).toEqual([...keysOf.source].sort());
  });

  it.each(LOCALE_NAMES.filter((l) => l !== "source"))(
    "carries the whole source key set in %s",
    (locale) => {
      const missing = [...keysOf.source].filter(
        (key) => !keysOf[locale].has(key),
      );
      expect(missing, `${locale}.json is missing source keys`).toEqual([]);
    },
  );
});
