# Working on BetterFleet

Onboarding notes for anyone (human or agent) touching this repository. BetterFleet is a free,
open-source companion app for *Sea of Thieves* that helps a crew land on the **same server**: it
reads the game's live status, shares each player's server and ready state across the alliance, and
fires a synchronized "set sail" so everyone clicks at once. Windows-only desktop app, self-hostable
backend, public statistics site.

This file is loaded automatically by Claude Code (and read by other agents) — keep it accurate as
the project evolves, and keep it free of machine-specific paths or secrets.

## Repository layout

The repo is three independent apps plus infra:

| Path | What it is | Stack |
|---|---|---|
| `webapp/` | The desktop app itself | Tauri v1 (Rust shell) + Vue 3 + TypeScript + Vite |
| `webapp/src-tauri/` | Native shell: global shortcuts, audio, overlay window, game detection | Rust (edition 2021) |
| `backend/` | Session/alliance API + SSE + stats | Quarkus (Java 17), Maven (`mvnw` wrapper) |
| `website/` | Public vitrine + statistics dashboard | Vue 3 + TypeScript + Vite |
| `deployment/` | Compose files, Helm chart, Keycloak realm, nginx, `init.sql` | — |
| `scripts/` | Release helpers (e.g. version bump from tag) | shell |

Auth is **Keycloak** (realm `Betterfleet`, OIDC client `application`). The real sign-in path is a
self-registered Keycloak account — a Microsoft/Xbox identity provider is configured in the realm but
has never worked, so don't document or rely on it as the login method.

## Commands per module

Run these from inside the module directory. Node scripts are the same shape in `webapp/` and
`website/`.

**Frontend (`webapp/`, `website/`)**
- `npm run dev` — Vite dev server (webapp on 5173, website on **5174**).
- `npm run build` — type-check then build (`vue-tsc && vite build`). This is the real type gate.
- `npm run test` — Vitest once (`test:watch` to watch).
- `npm run lint:check` / `lint:fix` — ESLint.
- `npm run prettier:check` / `prettier:write` — formatting. CI checks it; run it before committing.

**Desktop shell (`webapp/`)**
- `npm run tauri:dev` — run the full native app (spawns the Vite dev server itself).
- `npm run tauri:build` — production bundle.
- `cargo check` / `cargo test` (from `webapp/src-tauri/`) — see the Windows note under Gotchas.

**Backend (`backend/`)**
- `./mvnw compile quarkus:dev` — dev mode with live reload on **8080** (Dev UI at `/q/dev/`).
- `./mvnw test` — unit tests. Tests use an **in-memory H2** datasource (`%test` profile), so they
  need no database or containers.
- `./mvnw package` — build (`target/quarkus-app/quarkus-run.jar`).

## Local dev environment

Bring up the backing services with the dev compose file — it starts only the infra, not the app:

```
docker compose -f deployment/dev/docker-compose.yml up -d
```

| Service | Container | Host port |
|---|---|---|
| Postgres (app data) | `betterfleet-postgres-app` | `2600` → 5432 |
| Postgres (Keycloak) | `betterfleet-postgres-auth` | `2603` → 5432 |
| Keycloak | `betterfleet-keycloak` | `2604` → 8080 |

The backend's dev datasource and OIDC settings already point at these ports — connection details and
their env-var overrides live in [`backend/src/main/resources/application.properties`](backend/src/main/resources/application.properties)
(don't copy the credentials elsewhere; reference the file). The **full** stack (backend + website
images too) is `deployment/docker-compose.yml`; the app schema seed is `deployment/dev/init.sql`.

## Conventions

- **Default branch is `master`.** All PRs target it. Work one branch per issue (e.g.
  `feat/<slug>-<issue>`, `fix/<slug>`) and **squash-merge**.
- **Verify UI changes visually before merging.** CI type-checks and unit-tests but never catches a
  layout regression — render the component and confirm the change with your own eyes.
- **Commits and PRs are authored in the maintainer's voice** and match the existing git history: no
  tool/generator attribution in commit messages, trailers, or PR descriptions.
- **i18n — never hand-edit anything but `source.json`.** See `webapp/src/assets/locales/`:
  `source.json` is the English original you edit; `en.json` is a CI-regenerated copy; `fr.json` is
  human-translated; `de/es/it.json` are machine-translated then corrected in Crowdin. Edit strings
  **in place** — don't reformat a whole locale file (it reorders integer-keyed maps and blows up the
  diff). `Locales.spec.ts` enforces key parity across all six. Sync flow: `.github/workflows/crowdin.yml`.

## Gotchas (the non-obvious ones)

- **Keep Tauri on v1.** The `tauri*` crates must stay v1 and `tauri-action` must stay `@v0`; a v2
  bump dies with a cryptic `devPath`/config error. This is deliberate, not stale.
- **`cargo test`/`cargo check` on Windows need `BETTERFLEET_TEST_BUILD=1`.** The release build embeds
  an admin manifest; without that env var the test binary fails to launch (OS error 740, elevation).
- **The overlay window freezes when hidden behind the game.** WebView2 throttles occluded/background
  windows — timers stall and audio mutes. The fix is `additionalBrowserArgs` in `tauri.conf.json`
  (the `WEBVIEW2_*` env var is ignored by wry). Don't reintroduce timer/audio logic that assumes the
  overlay keeps ticking while covered.
- **SSE looks broken in dev — it isn't.** The webview origin is `https://tauri.localhost` while the
  dev backend is plain `http`, so the browser blocks `EventSource` (mixed content) and the client
  silently falls back to polling `/public-sessions` every 5s. You'll see those GETs loop in dev logs;
  production is same-origin HTTPS, so SSE connects and the poll idles. Not a regression.
- **Settings sections misalign if you drop multiple controls straight into `ParameterPart`.** It lays
  its slot children out as a centre-wrapping flex row, so mixed-width controls land on
  differently-offset lines. Any section with more than one control wraps them in a full-width column
  (see `.general-layout` / `.overlay-layout` in `ConfigComponent.vue`).

## Where to look first

- Game detection / native behavior: `webapp/src-tauri/src/`.
- Session & overlay state on the client: `webapp/src/objects/fleet/`.
- Settings screen (dense, many conventions above converge here): `webapp/src/components/fleet/ConfigComponent.vue`.
- API + SSE + stats: `backend/src/main/java/`.
- Anything user-facing in text: it's a translation key — start from `source.json`.
