# Workflows — build, run, test, ship

Commands are run from inside each module's directory unless noted. Frontend modules (`webapp/`,
`website/`) share the same npm script names.

## Prerequisites

- **Node.js** + npm — the two Vite apps.
- **JDK 17** — the Quarkus backend (uses the bundled `./mvnw` wrapper, so no system Maven needed).
- **Rust** + the Tauri v1 toolchain — only to build/run the desktop shell.
- **Docker** — the local backing services (Postgres, Keycloak).
- The desktop app is **Windows-only**; the backend and website build on any OS.

## Per-module commands

**Frontend — `webapp/` and `website/`**

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server (`webapp` → 5173, `website` → **5174**) |
| `npm run build` | `vue-tsc && vite build` — this is the real **type gate** |
| `npm run test` | Vitest once (`test:watch` to watch) |
| `npm run lint:check` / `lint:fix` | ESLint |
| `npm run prettier:check` / `prettier:write` | Formatting — CI enforces it, run before committing |

**Desktop shell — `webapp/`**

| Command | Does |
|---|---|
| `npm run tauri:dev` | Run the whole native app (it starts its own Vite dev server) |
| `npm run tauri:build` | Production bundle |
| `cargo check` / `cargo test` (in `webapp/src-tauri/`) | Rust — see the Windows note in [gotchas.md](gotchas.md) |

**Backend — `backend/`**

| Command | Does |
|---|---|
| `./mvnw compile quarkus:dev` | Dev mode, live reload, port **8080**, Dev UI at `/q/dev/` |
| `./mvnw test` | Unit tests on an **in-memory H2** datasource — no DB/containers needed |
| `./mvnw package` | Build `target/quarkus-app/quarkus-run.jar` |

## Local dev environment

Bring up only the backing services (not the app) with the dev compose file:

```
docker compose -f deployment/dev/docker-compose.yml up -d
```

| Service | Container | Host port |
|---|---|---|
| Postgres (app data) | `betterfleet-postgres-app` | `2600` → 5432 |
| Postgres (Keycloak) | `betterfleet-postgres-auth` | `2603` → 5432 |
| Keycloak | `betterfleet-keycloak` | `2604` → 8080 |

The backend's dev datasource and OIDC settings already target these ports — details and their env-var
overrides live in `backend/src/main/resources/application.properties` (reference it; don't copy the
credentials around). The **full** stack, including backend + website images, is
`deployment/docker-compose.yml`. The app schema seed is `deployment/dev/init.sql`.

Typical loop: `docker compose -f deployment/dev/docker-compose.yml up -d`, then
`./mvnw compile quarkus:dev` in `backend/`, then `npm run tauri:dev` in `webapp/`.

## CI (`.github/workflows/ci.yml`)

Runs on every push and pull request. A `paths` job detects which modules changed and the rest are
**path-filtered**, so a website-only PR doesn't run the backend or Tauri jobs. Jobs: `backend-build`,
`backend-test`, `webapp-build`, `webapp-analysis`, `webapp-test`, `website-build`,
`website-analysis`, `website-test`, and `test-tauri` / `tauri-test`. "analysis" = lint + prettier.
CI type-checks and unit-tests but **never catches a layout regression** — verify UI yourself (see
[conventions.md](conventions.md)).

## Release (`.github/workflows/release.yml`, "Publish")

Triggered by pushing a **`v*` tag** (or `workflow_dispatch` with a version). Pipeline:
`resolve-version` → **`verify`** (a test gate that must pass before anything publishes) →
`publish-tauri` + `publish-backend` + `publish-website` → `sync-version-to-master` (writes the
resolved version back). Version numbers flow from the tag via `.github/scripts/set-version-from-tag.mjs`.
Before tagging a release, confirm the required secrets and branch protection are in place, since the
`verify` gate now blocks publish on any test failure.

## Translations (`.github/workflows/crowdin*.yml`)

`crowdin.yml` ("Crowdin") syncs strings on push/schedule/dispatch; `crowdin-seed.yml` ("Crowdin
seed", manual) seeds missing translations so Crowdin doesn't return English for never-received
strings. The i18n editing rules are in [conventions.md](conventions.md).
