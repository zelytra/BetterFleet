# Conventions

How work is branched, reviewed, and merged here, plus the i18n rules that trip people up.

## Branching & PRs

- **Default branch is `master`** — every PR targets it.
- **One branch per issue**, one concern per branch. Naming follows `feat/<slug>-<issue>` or
  `fix/<slug>`. Keep unrelated changes on separate branches with separate PRs, even when they're
  requested together.
- **Squash-merge** into `master`. No merge commits from feature branches.
- **Merging to `master` needs the maintainer's explicit go-ahead.** Prepare the branch, open the PR,
  make it green — then wait for the call to merge.

## Verify UI before merging

CI type-checks and runs unit tests, but it will happily merge a broken layout. For any change that is
visible on screen, **render it and confirm with your own eyes** (measure the DOM, compare against the
neighbouring component) before calling it done. Layout regressions are the failure mode CI cannot see.

## Commits & PR text

- Written in the **maintainer's voice** and matching the existing git history.
- **No tool or generator attribution** anywhere — not in commit messages, trailers, or PR
  descriptions. No "Co-Authored-By" of a tool, no generated-by footer.
- Conventional-commit style subjects (`feat(scope): …`, `fix(scope): …`, `docs: …`) with a body that
  explains the *why*, not a diff restatement.

## i18n — the one rule that matters

Locale files live in `webapp/src/assets/locales/` (and the website has its own set). There are six:

| File | Origin — **do not** hand-edit unless noted |
|---|---|
| `source.json` | English original — **this is the only file you edit by hand** |
| `en.json` | CI-regenerated copy of `source.json` — never touch |
| `fr.json` | Human-translated (never machine-translated) |
| `de.json`, `es.json`, `it.json` | Machine-translated, then corrected in Crowdin |

- **Edit strings in place.** Never `JSON.parse` → `stringify` a whole locale file or run a formatter
  that rewrites it — the integer-keyed maps get reordered and the diff explodes.
- **`Locales.spec.ts` enforces key parity** across all six files (keys, not values). Add a key to
  every file or the test fails.
- After merging changes that touch strings, the French seed workflow may be needed so Crowdin doesn't
  serve English for strings it never received. Sync lives in `.github/workflows/crowdin.yml`.
- The settings screen deliberately avoids em-dashes in its strings — match the surrounding copy.

## Formatting

Run `npm run prettier:check` and `npm run lint:check` (or the `:fix`/`:write` variants) before
committing frontend changes — CI's "analysis" jobs fail otherwise. The repo's line endings are
handled by git; don't fight the CRLF/LF warnings, just don't reformat files you didn't change.
