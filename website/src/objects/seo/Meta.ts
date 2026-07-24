import type { RouteLocationNormalized } from "vue-router";

const SITE = "https://betterfleet.fr";

/** The languages this site actually has copy for. */
const SHIPPED = ["en", "fr", "de", "es", "it"];

/**
 * Per-route title, description and canonical.
 *
 * All four routes shipped the same title — "BetterFleet" — and the same description, so nothing but
 * the home page could rank for what it is actually about: a search for "sea of thieves same server
 * tutorial" had no page here to match, because every page claimed to be the same one.
 *
 * These are translation keys, not text. The description a crawler reads has to be in the language
 * the page renders in, and that is decided at runtime from navigator.language (appStore.ts).
 */
const PAGES: Record<
  string,
  { title: string; description: string; noindex?: boolean }
> = {
  "/": { title: "seo.home.title", description: "seo.home.description" },
  "/tutorial": {
    title: "seo.tutorial.title",
    description: "seo.tutorial.description",
  },
  "/support": {
    title: "seo.support.title",
    description: "seo.support.description",
  },
  "/reports": {
    title: "seo.reports.title",
    description: "seo.reports.description",
    // Players' own bug reports, with their logs. robots.txt disallows the path; this is the half
    // that still works once someone links to it, because a crawler handed a URL does not ask
    // robots.txt whether it may index what it already has.
    noindex: true,
  },
  // The console-guest lobby (#682): a personal deep link keyed on a session code — never something a
  // crawler should index. Keyed by the route pattern, matched via route.matched below.
  "/s/:code": {
    title: "seo.lobby.title",
    description: "seo.lobby.description",
    noindex: true,
  },
  // How a console player joins — real, indexable content (#682).
  "/console": {
    title: "seo.console.title",
    description: "seo.console.description",
  },
  // Catch-all 404, keyed by the route pattern (matched via route.matched). Never indexed.
  "/:pathMatch(.*)*": {
    title: "seo.notFound.title",
    description: "seo.notFound.description",
    noindex: true,
  },
};

/** name="x" or property="x" — Open Graph uses property, everything else uses name. */
function setMeta(kind: "name" | "property", key: string, content: string) {
  const selector = `meta[${kind}="${key}"]`;
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(kind, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  );
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

/**
 * `t` is passed in rather than imported: this runs from a router guard, where there is no component
 * instance and useI18n() throws.
 */
export function applyRouteMeta(
  route: RouteLocationNormalized,
  t: (key: string) => string,
  lang: string,
) {
  // Static paths match directly; a param route (e.g. /s/ABC123) falls back to its pattern (/s/:code).
  const page =
    PAGES[route.path] ?? PAGES[route.matched[route.matched.length - 1]?.path];
  if (!page) return;

  const title = t(page.title);
  const description = t(page.description);

  document.title = title;
  // AppStore.init() sets lang straight from navigator.language.substring(0, 2), whatever that is. A
  // visitor with a Japanese browser gets lang="ja" on a page vue-i18n has just fallen back to
  // English for — which tells a search engine to file English copy as Japanese. Claim only a
  // language we actually have, and otherwise say what the reader is really getting.
  document.documentElement.setAttribute(
    "lang",
    SHIPPED.includes(lang) ? lang : "en",
  );

  setMeta("name", "description", description);
  setMeta("name", "robots", page.noindex ? "noindex,nofollow" : "index,follow");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", description);
  setMeta("property", "og:url", SITE + route.path);
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", description);

  setCanonical(SITE + route.path);
}
