# Working on BetterFleet

Onboarding notes for anyone (human or agent) touching this repository. BetterFleet is a free,
open-source companion app for *Sea of Thieves* that helps a crew land on the **same server**: it
reads the game's live status, shares each player's server and ready state across the alliance, and
fires a synchronized "set sail" so everyone clicks at once. Windows and Linux desktop app,
self-hostable backend, public statistics site.

This file is loaded automatically by Claude Code (and read by other agents). Keep it accurate as
the project evolves, and keep it free of machine-specific paths or secrets.

**Deeper reference lives in [`.claude/docs/`](.claude/docs/README.md)**: a library covering
architecture, per-module deep dives (frontend/backend), workflows, conventions, gotchas, and
step-by-step recipes. This file is the concise entry point; reach for the docs folder when you need
depth on a specific area.

## Repository layout

The repo is three independent apps plus infra:

| Path | What it is | Stack |
|---|---|---|
| `webapp/` | The desktop app itself | Tauri v2 (Rust shell) + Vue 3 + TypeScript + Vite |
| `webapp/src-tauri/` | Native shell: global shortcuts, audio, overlay window, game detection | Rust (edition 2021) |
| `backend/` | Session/alliance API + SSE + stats | Quarkus (Java 17), Maven (`mvnw` wrapper) |
| `website/` | Public vitrine + statistics dashboard | Vue 3 + TypeScript + Vite |
| `deployment/` | Compose files, Helm chart, Keycloak realm, nginx, `init.sql` | - |
| `scripts/` | Release helpers (e.g. version bump from tag) | shell |

Auth is **Keycloak** (realm `Betterfleet`, OIDC client `application`). The real sign-in path is a
self-registered Keycloak account. A Microsoft/Xbox identity provider is configured in the realm but
has never worked, so don't document or rely on it as the login method.

## Commands per module

Run these from inside the module directory. Node scripts are the same shape in `webapp/` and
`website/`.

**Frontend (`webapp/`, `website/`)**
- `npm run dev`: Vite dev server (webapp on 5173, website on **5174**).
- `npm run build`: type-check then build (`vue-tsc && vite build`). This is the real type gate.
- `npm run test`: Vitest once (`test:watch` to watch).
- `npm run lint:check` / `lint:fix`: ESLint.
- `npm run prettier:check` / `prettier:write`: formatting. CI checks it; run it before committing.

**Desktop shell (`webapp/`)**
- `npm run tauri:dev`: run the full native app (spawns the Vite dev server itself).
- `npm run tauri:build`: production bundle for the host platform.
- `npm run tauri:build:linux`: the Linux artifacts CI ships (`.deb` + `.rpm`, no signing key needed).
- `npm run tauri:build:windows`: the Windows `.exe`, cross-compiled from Linux via `cargo-xwin`
  (raw exe, no NSIS installer). One-time setup: `rustup target add x86_64-pc-windows-msvc` and
  `cargo install --locked cargo-xwin`; the script echoes these when missing.
- `cargo check` / `cargo test` (from `webapp/src-tauri/`): see the Windows note under Gotchas.

**Backend (`backend/`)**
- `./mvnw compile quarkus:dev`: dev mode with live reload on **8080** (Dev UI at `/q/dev/`).
- `./mvnw test`: unit tests. Tests use an **in-memory H2** datasource (`%test` profile), so they
  need no database or containers.
- `./mvnw package`: build (`target/quarkus-app/quarkus-run.jar`).

## Local dev environment

Bring up the backing services with the dev compose file (it starts only the infra, not the app):

```
docker compose -f deployment/dev/docker-compose.yml up -d
```

| Service | Container | Host port |
|---|---|---|
| Postgres (app data) | `betterfleet-postgres-app` | `2600` → 5432 |
| Postgres (Keycloak) | `betterfleet-postgres-auth` | `2603` → 5432 |
| Keycloak | `betterfleet-keycloak` | `2604` → 8080 |

The backend's dev datasource and OIDC settings already point at these ports. Connection details and
their env-var overrides live in [`backend/src/main/resources/application.properties`](backend/src/main/resources/application.properties)
(don't copy the credentials elsewhere; reference the file). The **full** stack (backend + website
images too) is `deployment/docker-compose.yml`; the app schema seed is `deployment/dev/init.sql`.

## Conventions

- **Default branch is `master`.** All PRs target it. Work one branch per issue (e.g.
  `feat/<slug>-<issue>`, `fix/<slug>`) and **squash-merge**.
- **Verify UI changes visually before merging.** CI type-checks and unit-tests but never catches a
  layout regression: render the component and confirm the change with your own eyes.
- **Commits and PRs are authored in the maintainer's voice** and match the existing git history: no
  tool/generator attribution in commit messages, trailers, or PR descriptions.
- **i18n: never hand-edit anything but `source.json`.** See `webapp/src/assets/locales/`:
  `source.json` is the English original you edit; `en.json` is a CI-regenerated copy; `fr.json` is
  human-translated; `de/es/it.json` are machine-translated then corrected in Crowdin. Edit strings
  **in place**: don't reformat a whole locale file (it reorders integer-keyed maps and blows up the
  diff). `Locales.spec.ts` enforces key parity across all six. Sync flow: `.github/workflows/crowdin.yml`.

## Gotchas (the non-obvious ones)

- **Tauri is on v2** (migrated for the Linux port, #735). `tauri-action` is pinned to `@v1` (not `@v0`),
  the config is the v2 schema, and updater signing uses `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Don't reintroduce v1 config shapes or the old key names.
- **The overlay window freezes when hidden behind the game.** WebView2 throttles occluded/background
  windows: timers stall and audio mutes. The fix is `additionalBrowserArgs` in `tauri.conf.json`
  (the `WEBVIEW2_*` env var is ignored by wry). Don't reintroduce timer/audio logic that assumes the
  overlay keeps ticking while covered.
- **Packet capture lives in one Tauri-free crate, `better_fleet_netcap`, with a backend per OS
  (#726, #732).** `run_capture` is the single entry point: `AF_PACKET`/`CAP_NET_RAW` on Linux,
  promiscuous `SOCK_RAW`/`SIO_RCVALL`/Administrator on Windows; both blocking, the GUI wraps them in
  `spawn_blocking`. On Linux the privileged half already runs out-of-process in the tiny
  `betterfleet-netcap` binary, so the GUI stays unprivileged (it falls back to in-process capture
  when the helper is missing or uncapped); Windows still runs it in-process behind its admin
  manifest until the service in #732 lands. `npm run tauri:dev`
  builds and `setcap`s it for you; the `.deb` post-install and the pacman package's `.install` do it
  at install time, so end users never run setcap. Under Proton the game spreads its UDP sockets across ~100
  `sotgame.exe` task PIDs plus `wineserver`, so candidate ports are unioned across all of them (#725).
- **SSE looks broken in dev: it isn't.** The webview origin is `https://tauri.localhost` while the
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
- Anything user-facing in text: it's a translation key, so start from `source.json`.
