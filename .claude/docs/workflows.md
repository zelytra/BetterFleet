# Workflows: build, run, test, ship

Commands are run from inside each module's directory unless noted. Frontend modules (`webapp/`,
`website/`) share the same npm script names.

## Prerequisites

- **Node.js** + npm: the two Vite apps.
- **JDK 17**: the Quarkus backend (uses the bundled `./mvnw` wrapper, so no system Maven needed).
- **Rust** + the Tauri v2 toolchain: only to build/run the desktop shell.
- **Docker**: the local backing services (Postgres, Keycloak).
- The desktop app targets **Windows and Linux**; the backend and website build on any OS.

## Per-module commands

**Frontend: `webapp/` and `website/`**

| Command | Does |
|---|---|
| `npm run dev` | Vite dev server (`webapp` → 5173, `website` → **5174**) |
| `npm run build` | `vue-tsc && vite build`: this is the real **type gate** |
| `npm run test` | Vitest once (`test:watch` to watch) |
| `npm run lint:check` / `lint:fix` | ESLint |
| `npm run prettier:check` / `prettier:write` | Formatting: CI enforces it, run before committing |

**Desktop shell: `webapp/`**

| Command | Does |
|---|---|
| `npm run tauri:dev` | Run the whole native app (it starts its own Vite dev server) |
| `npm run tauri:build` | Production bundle for the host platform |
| `npm run tauri:build:linux` | The `.deb`/`.rpm` CI ships (`NO_STRIP=true`, like the release job) |
| `npm run tauri:build:windows` | Windows `.exe` cross-compiled from Linux (`scripts/build-windows.mjs`, cargo-xwin) |
| `cargo check` / `cargo test` (in `webapp/src-tauri/`) | Rust: see the Windows note in [gotchas.md](gotchas.md) |

**Backend: `backend/`**

| Command | Does |
|---|---|
| `./mvnw compile quarkus:dev` | Dev mode, live reload, port **8080**, Dev UI at `/q/dev/` |
| `./mvnw test` | Unit tests on an **in-memory H2** datasource: no DB/containers needed |
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

The backend's dev datasource and OIDC settings already target these ports. Details and their env-var
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
CI type-checks and unit-tests but **never catches a layout regression**: verify UI yourself (see
[conventions.md](conventions.md)).

## Release (`.github/workflows/release.yml`, "Publish")

Triggered by pushing a **`v*` tag** (or `workflow_dispatch` with a version). Pipeline:
`resolve-version` → **`verify`** (a test gate that must pass before anything publishes) →
`publish-tauri` + `publish-backend` + `publish-website` → `sync-version-to-master` (writes the
resolved version back). Version numbers flow from the tag via `.github/scripts/set-version-from-tag.mjs`.
Before tagging a release, confirm the required secrets and branch protection are in place, since the
`verify` gate now blocks publish on any test failure.

## Windows install & update contract (2.4.0+)

**The NSIS installer is per-machine and owns a Windows service.** `bundle.windows.nsis.installMode`
is `perMachine`: the app installs to `C:\Program Files\BetterFleet`, uninstall metadata lives in
HKLM, and the *installer* is what requires elevation. The capture service
(`betterfleet-capture-service.exe`, SCM name `BetterFleetCapture`, #816) ships via the resources map
in `webapp/src-tauri/tauri.windows.conf.json` and is registered, repaired, and started by the hooks
in `webapp/src-tauri/windows/hooks.nsh` (`installerHooks`). Because `updater.windows.installMode`
is `passive`, the installer — hooks included — re-runs on **every update**, exactly like the pacman
`post_upgrade` hook re-runs `setcap` on Linux. Anything added to those hooks must be idempotent:
stop-if-exists before files are copied, `sc create`-or-`config` plus `sc start` after.

**UAC moves from every launch to every update.** Through 2.3.x the app manifest was
`requireAdministrator` (`webapp/src-tauri/build.rs`), so players saw UAC at each launch. From 2.4.0
the privilege lives in the service; once the GUI drops the admin manifest (#819), the only elevation
left is the installer — one UAC consent per update, none at launch. Until the GUI actually drops it,
updates stay prompt-free instead (the elevated app spawns the installer, which inherits the token).

**The first per-machine update silently retires the old per-user install.** NSIS only
auto-replaces a previous install of the *same scope*, so `NSIS_HOOK_PREINSTALL` reads the 2.3.x
uninstall entry from `HKCU\...\Uninstall\BetterFleet`, runs that uninstaller with `/S _?=<dir>`
(silent and in-place, so the wait is real), and sweeps what it cannot delete of itself. Settings
survive by construction: they live in webview localStorage under `%LOCALAPPDATA%\fr.zelytra` and in
`%APPDATA%\fr.zelytra` (overlay layout) — outside both install roots — and a silent uninstall never
deletes app data (that is a GUI-only checkbox). The migration itself is prompt-free because the
still-elevated 2.3.x app spawns it.

**None of this is covered by CI.** PR builds pass `--no-bundle` (`.github/workflows/ci.yml`), so an
installer only exists on a `v*` tag. Validate installer changes against the VM matrix in #818
(fresh install, 2.3.x migration, per-machine update, uninstall, broken-service reinstall,
declined UAC) on a pre-release tag before any stable tag.

## Translations (`.github/workflows/crowdin*.yml`)

`crowdin.yml` ("Crowdin") syncs strings on push/schedule/dispatch; `crowdin-seed.yml` ("Crowdin
seed", manual) seeds missing translations so Crowdin doesn't return English for never-received
strings. The i18n editing rules are in [conventions.md](conventions.md).
