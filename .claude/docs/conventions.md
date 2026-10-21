# Conventions

How work is branched, reviewed, and merged here, plus the i18n rules that trip people up.

## Branching & PRs

- **Default branch is `master`**: every PR targets it.
- **One branch per issue**, one concern per branch. Naming follows `feat/<slug>-<issue>` or
  `fix/<slug>`. Keep unrelated changes on separate branches with separate PRs, even when they're
  requested together.
- **Squash-merge** into `master`. No merge commits from feature branches.
- **Merging to `master` needs the maintainer's explicit go-ahead.** Prepare the branch, open the PR,
  make it green, then wait for the call to merge.

## Verify UI before merging

CI type-checks and runs unit tests, but it will happily merge a broken layout. For any change that is
visible on screen, **render it and confirm with your own eyes** (measure the DOM, compare against the
neighbouring component) before calling it done. Layout regressions are the failure mode CI cannot see.

## Commits & PR text

- Written in the **maintainer's voice** and matching the existing git history.
- **No tool or generator attribution** anywhere: not in commit messages, trailers, or PR
  descriptions. No "Co-Authored-By" of a tool, no generated-by footer.
- Conventional-commit style subjects (`feat(scope): …`, `fix(scope): …`, `docs: …`) with a body that
  explains the *why*, not a diff restatement.

## PR descriptions

Match the maintainer's merged PRs (#901, #904, #905, #907 are good models). The shape:

- **Title**: the conventional-commit subject, **without** an issue number. Squash-merge appends the
  PR number (`… (#907)`), so a `(#906)` in the title would end up doubled in `master`'s history.
- **First line**: `Closes #N.` (or `Follow-up to #N: <one-line symptom>.` for a fix to a merged PR).
  Not `Fixes`, not a heading.
- **`##` sections with narrative headings**, prose first, bullets only for genuinely parallel points.
  Pick the ones that apply, in roughly this order:
  - the cause: `## The bug, in one line` / `## Why …`, with the evidence (report id, log line,
    numbers from the field);
  - `## Red first`: the new test's **actual failing output on `master`**, in a code block, plus why
    the old tests let it through;
  - the change: `## Fix` / `## The rule` / `## Decisions` (each decision bolded, then its reason);
  - `## What must not change, and is tested`: the regression the fix could cause and the test
    pinning it;
  - `## Verification`: the exact commands and their counts (`npm run test` 312 passed, `cargo test`
    138 pass, build/lint/prettier clean), visual checks for UI, and any known environment-only
    failure named as such;
  - `## Also in …` / `## What stays open`: incidental lockfile churn, follow-ups, calls left to the
    maintainer.
- **Never claim a check that did not run.** If something could not be run where the branch was
  prepared, say so plainly under `## Verification` and name the CI job that is the gate.
- **Labels mirror the issue**: a type (`bug`, `enhancement`, `dependencies`, `documentation`) plus
  the areas touched (`backend`, `java`, `webapp`, `website`, `rust`, `client-backend`, `ui-ux`,
  `i18n`). No assignee, not a draft.

## i18n: the one rule that matters

Locale files live in `webapp/src/assets/locales/` (and the website has its own set). There are
fourteen since #778:

| File | Origin: **do not** hand-edit unless noted |
|---|---|
| `source.json` | English original: **this is the only file you edit by hand** |
| `en.json` | CI-regenerated copy of `source.json`: never touch |
| `fr.json` | Human-translated (never machine-translated) |
| `de.json`, `es.json`, `it.json`, `hi.json`, `ja.json`, `ko.json`, `pl.json`, `pt.json`, `ru.json`, `uk.json`, `zh.json` | Machine-translated, then corrected in Crowdin |

- **Edit strings in place.** Never `JSON.parse` → `stringify` a whole locale file or run a formatter
  that rewrites it: the integer-keyed maps get reordered and the diff explodes.
- **`Locales.spec.ts` enforces key parity** (keys, not values). Add a key to every file or the
  test fails.
- After merging changes that touch strings, the French seed workflow may be needed so Crowdin doesn't
  serve English for strings it never received. Sync lives in `.github/workflows/crowdin.yml`.
- **No em-dashes in comments or documentation** (#749): use a colon, a comma, or parentheses
  instead. This is a repo-wide rule, not an i18n one. Em-dashes in `source.json` and the other locale
  files (and in any user-visible display string) are fine and must **not** be "fixed".

## Formatting

Run `npm run prettier:check` and `npm run lint:check` (or the `:fix`/`:write` variants) before
committing frontend changes: CI's "analysis" jobs fail otherwise. The repo's line endings are
handled by git; don't fight the CRLF/LF warnings, just don't reformat files you didn't change.
