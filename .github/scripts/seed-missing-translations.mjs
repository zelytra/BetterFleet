/**
 * Fills the strings Crowdin never received, and nothing else.
 *
 * This repo's translations predate the Crowdin project. Only the English source was ever uploaded, so
 * strings that arrived here already translated are untranslated as far as Crowdin is concerned, and
 * it hands English back for them on download — which is what `check-untranslation.mjs` refuses. This
 * is the other half: put the missing translations *into* Crowdin so the sync has something to return.
 *
 * Run AFTER `crowdin download`, so the working tree holds what Crowdin currently has and HEAD holds
 * what this repo has. The file it writes for upload is Crowdin's own download, patched only where
 * Crowdin returned the English source and the repo has a real translation.
 *
 * That patch-don't-rebuild shape is the whole safety argument. Uploading the repo's file wholesale
 * would depend on how Crowdin merges an upload that collides with an existing translation, which is
 * not something to bet a translator's work on. Handing Crowdin its own values straight back cannot
 * lose anything under any merge semantics — every string Crowdin already has is uploaded exactly as
 * Crowdin has it. Only the holes carry new content. It also self-corrects: if a translator filled one
 * of the holes ten minutes ago, the download has their version, it is no longer English, and this
 * leaves it alone.
 *
 * (Re-serialising moves integer-like keys — "0", "1", "10" — to the front in numeric order, so the
 * file written here is not byte-identical to the download. Crowdin maps by key and this file is never
 * committed, so only the values matter, and every one of those is preserved.)
 *
 * A locale is required, and deliberately so. "Crowdin returned English" and "a translator decided the
 * English word is the translation" are the same thing to this script, and it cannot tell them apart —
 * de's "Zwietracht" -> "Discord" is a real fix that this would happily revert. Italian is safe
 * because 40 strings reverting at once is a gap, not a decision. Do not reach for a --all flag.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const LOCALE_DIRS = ["webapp/src/assets/locales", "website/src/assets/locales"];

const locale = process.argv[2];
if (!locale || !/^[a-z]{2}$/.test(locale)) {
  console.error("usage: seed-missing-translations.mjs <locale>   (e.g. it)");
  process.exit(2);
}
if (locale === "en") {
  console.error("en is the source language, not a translation.");
  process.exit(2);
}

const flatten = (value, prefix = "", out = {}) => {
  for (const [key, inner] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner && typeof inner === "object") flatten(inner, path, out);
    else out[path] = inner;
  }
  return out;
};

const setPath = (root, path, value) => {
  const keys = path.split(".");
  let node = root;
  for (const key of keys.slice(0, -1)) node = node[key];
  node[keys.at(-1)] = value;
};

let filled = 0;

for (const dir of LOCALE_DIRS) {
  const path = `${dir}/${locale}.json`;
  const english = flatten(JSON.parse(readFileSync(`${dir}/source.json`, "utf8")));

  let committed;
  try {
    committed = flatten(JSON.parse(execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" })));
  } catch {
    continue; // this locale is not in the repo; nothing of ours to seed with
  }

  // Crowdin's own download, kept nested — this object is what gets uploaded back.
  const fromCrowdin = JSON.parse(readFileSync(path, "utf8"));
  const flatCrowdin = flatten(fromCrowdin);

  const holes = Object.keys(committed).filter(
    (key) =>
      flatCrowdin[key] === english[key] && // Crowdin handed back the source text
      committed[key] !== english[key] && // and we have a real translation for it
      flatCrowdin[key] !== undefined,
  );

  if (!holes.length) {
    console.log(`${path}: nothing missing.`);
    continue;
  }

  for (const key of holes) setPath(fromCrowdin, key, committed[key]);
  writeFileSync(path, JSON.stringify(fromCrowdin, null, 2) + "\n");
  filled += holes.length;

  console.log(`${path}: filling ${holes.length} string(s) Crowdin does not have.`);
  for (const key of holes.slice(0, 10)) {
    console.log(`    ${key}:  ${JSON.stringify(committed[key])}`);
  }
  if (holes.length > 10) console.log(`    ... and ${holes.length - 10} more`);
}

if (!filled) {
  console.log(`\nCrowdin already has every ${locale} translation this repo has. Nothing to upload.`);
  process.exit(1); // the workflow reads this as "skip the upload"
}
console.log(`\n${filled} string(s) staged for upload. Every other string is Crowdin's own, unchanged.`);
