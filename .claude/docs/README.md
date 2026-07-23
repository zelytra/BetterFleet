# BetterFleet — agent documentation

A reference library for anyone (human or agent) working in this repo. The goal is to remove
rediscovery: before grepping the whole tree to relearn how something works, check here.

The concise entry point is [`/CLAUDE.md`](../../CLAUDE.md) at the repo root (auto-loaded by Claude
Code). These files are the depth behind it.

## Map

| Doc | Read it when you need to… |
|---|---|
| [architecture.md](architecture.md) | Understand how the three apps fit together — data flow, real-time sessions, auth |
| [workflows.md](workflows.md) | Build, run, test, or release a module; stand up the local dev environment |
| [conventions.md](conventions.md) | Branch, commit, open a PR, or edit translations the right way |
| [frontend.md](frontend.md) | Work in `webapp/` — Vue components, the client object model, the Tauri bridge |
| [backend.md](backend.md) | Work in `backend/` — Quarkus resources, the WebSocket session protocol, persistence |
| [gotchas.md](gotchas.md) | Avoid the non-obvious traps that cost hours |
| [recipes.md](recipes.md) | Follow a step-by-step playbook for a common change |

## The 30-second orientation

BetterFleet helps a *Sea of Thieves* crew land on the **same server**. Three apps:

- **`webapp/`** — the Windows desktop app. A **Tauri v1** Rust shell (game detection, global
  hotkey, overlay window, native audio) wrapping a **Vue 3 + TypeScript** UI.
- **`backend/`** — a **Quarkus** (Java 17) service. Real-time alliance sessions over **WebSocket**,
  plus REST for public sessions, anonymous statistics, diagnostic reports, and a GitHub release
  proxy.
- **`website/`** — the **Vue 3** public vitrine and statistics dashboard.

Auth is **Keycloak** (OIDC). Translations are Crowdin-managed. Everything merges to **`master`** via
squash-merged PRs.

Keep these docs accurate as the code changes — a stale doc costs more than a missing one.
