Closes #

<!--
Title: the conventional-commit subject (`fix(scope): ...`), without an issue number: squash-merge
appends the PR number. Labels mirror the issue: a type plus the areas touched.
Keep the sections that apply, drop the others. Prose first; bullets for genuinely parallel points.
-->

## The bug, in one line

<!-- The cause, with the evidence: report id, log line, numbers from the field. For a feature: "## What". -->

## Red first

<!-- The new test's actual failing output on `master`, and why the existing tests let it through. -->

```
```

## Fix

<!-- What changed and why this way. For several choices use "## Decisions", each one bolded, then its reason. -->

## What must not change, and is tested

<!-- The regression this change could cause, and the test that pins it. -->

## Verification

<!--
The exact commands and their results (`npm run test` N passed, `./mvnw test`, `cargo test`,
build / lint / prettier). For UI: what you rendered and at which sizes. Never claim a check that
did not run: say what could not be run and which CI job is the gate.
-->
