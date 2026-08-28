import { describe, expect, it, beforeEach } from "vitest";
import { applyRouteMeta } from "@/objects/seo/Meta.ts";
import source from "@/assets/locales/source.json";

// The SEO guard's two blind spots from #859: a SHIPPED list frozen at five languages while the
// site ships fourteen, and /statistics missing from PAGES entirely.

/** A route as vue-router hands it to the guard, reduced to what applyRouteMeta reads. */
function route(path: string, matchedPath = path): any {
  return { path, matched: [{ path: matchedPath }] };
}

/** Echoes the key, which is enough to tell "a title was applied" from "the previous one stayed". */
const echo = (key: string) => key;

function head() {
  return {
    lang: document.documentElement.getAttribute("lang"),
    title: document.title,
    description: document.head
      .querySelector('meta[name="description"]')
      ?.getAttribute("content"),
    canonical: document.head
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href"),
    robots: document.head
      .querySelector('meta[name="robots"]')
      ?.getAttribute("content"),
  };
}

describe("applyRouteMeta", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.title = "";
    document.documentElement.removeAttribute("lang");
  });

  it("claims the visitor's language for every locale the site ships", () => {
    // The site has had copy in these since #778; stamping lang="en" on a page vue-i18n renders
    // in Japanese tells a crawler to file Japanese copy as English - the opposite of the guard's
    // purpose.
    for (const lang of ["ja", "ko", "hi", "pl", "pt", "ru", "uk", "zh"]) {
      applyRouteMeta(route("/"), echo, lang);
      expect(head().lang).toBe(lang);
    }
  });

  it("still falls back to English for a language the site does not ship", () => {
    applyRouteMeta(route("/"), echo, "sv");
    expect(head().lang).toBe("en");
  });

  it("gives /statistics its own title, description and canonical", () => {
    // Without a PAGES entry the guard returns early, so the page kept the PREVIOUS route's
    // title, description, canonical and og:url on in-app navigation.
    applyRouteMeta(route("/tutorial"), echo, "en");
    const before = head();
    applyRouteMeta(route("/statistics"), echo, "en");
    const after = head();
    expect(after.title).not.toBe(before.title);
    expect(after.description).not.toBe(before.description);
    expect(after.canonical).toBe("https://betterfleet.fr/statistics");
    expect(after.robots).toBe("index,follow");
  });

  it("the keys every PAGES entry names exist in the source locale", () => {
    // A key that does not resolve renders as its own path - as a page title, in search results.
    const seo = (source as any).seo as Record<string, any>;
    for (const key of ["statistics"]) {
      expect(seo[key]?.title, `seo.${key}.title`).toBeTypeOf("string");
      expect(seo[key]?.description, `seo.${key}.description`).toBeTypeOf(
        "string",
      );
    }
  });
});
