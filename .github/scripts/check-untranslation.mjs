/**
 * Refuses a Crowdin sync that would hand back English where a translation used to be.
 *
 * Crowdin fills untranslated strings with the source text on download. So any string that lives in
 * a locale file here but was never uploaded to Crowdin comes back *in English*, and the sync reads
 * as a routine "sync translations" diff while quietly un-translating the app. That is not
 * hypothetical: the first run of this workflow proposed replacing 40 Italian strings with English —
 * "Impostazioni" -> "Settings", "Caricamento..." -> "Loading..." — because the repo's Italian had
 * never been uploaded to the project.
 *
 * Compares each locale as committed (git HEAD) against what Crowdin just wrote, using source.json
 * as the definition of English.
 *
 * Deliberately a threshold and not zero: a translator may legitimately decide the English word *is*
 * the translation — "Zwietracht" -> "Discord" was a real fix in this repo — and that is
 * indistinguishable, string by string, from a missing translation. What is distinguishable is
 * scale. A translator changes a handful; a locale absent from Crowdin loses dozens at once.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const LOCALE_DIRS = ["webapp/src/assets/locales", "website/src/assets/locales"];
const TRANSLATED = ["fr", "de", "es", "it"]; // en/source are English by definition
const MAX_REVERTED_PER_LOCALE = 5;

function flatten(value, prefix = "", out = {}) {
  for (const [key, inner] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (inner && typeof inner === "object") flatten(inner, path, out);
    else out[path] = inner;
  }
  return out;
}

/** The file as committed, i.e. before Crowdin touched it. */
function committed(path) {
  try {
    return flatten(JSON.parse(execFileSync("git", ["show", `HEAD:${path}`], { encoding: "utf8" })));
  } catch {
    return null; // new file; nothing could have been lost
  }
}

let failed = false;

for (const dir of LOCALE_DIRS) {
  const english = flatten(JSON.parse(readFileSync(`${dir}/source.json`, "utf8")));

  for (const locale of TRANSLATED) {
    const path = `${dir}/${locale}.json`;
    const before = committed(path);
    if (!before) continue;
    const after = flatten(JSON.parse(readFileSync(path, "utf8")));

    const reverted = Object.keys(before).filter(
      (key) =>
        before[key] !== english[key] && // it was genuinely translated
        after[key] === english[key] && // and Crowdin just handed back the English
        after[key] !== undefined,
    );

    if (reverted.length > MAX_REVERTED_PER_LOCALE) {
      failed = true;
      console.log(
        `::error file=${path}::${reverted.length} strings would revert to English. ` +
          `That is Crowdin not having them, not a translation — seed the project with ` +
          `\`crowdin upload translations -l ${locale}\` before syncing again.`,
      );
      for (const key of reverted.slice(0, 10)) {
        console.log(`    ${key}:  ${JSON.stringify(before[key])}  ->  ${JSON.stringify(after[key])}`);
      }
      if (reverted.length > 10) console.log(`    ... and ${reverted.length - 10} more`);
    } else if (reverted.length) {
      // Under the threshold: most likely a translator choosing the English word on purpose.
      console.log(
        `::warning file=${path}::${reverted.length} string(s) now match the English source ` +
          `(${reverted.join(", ")}). Fine if that is the translation; look if it is not.`,
      );
    }
  }
}

if (failed) {
  console.log("");
  console.log("Nothing was pushed. The translations in Crowdin are untouched.");
  process.exit(1);
}
console.log("No locale loses translations in this sync.");
