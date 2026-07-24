# Frontend (`webapp/`)

A **Vue 3 + TypeScript** UI (`<script setup>`, Composition API, Vite) wrapped in a **Tauri v1** Rust
shell. The Rust side (`webapp/src-tauri/src/`) does the OS-level work; the Vue side is the UI and all
the session logic. Entry point: `webapp/src/main.ts`.

> This describes the code on `master`, which now includes the 2.2.0 wave — the in-app "what's new"
> modal (#686), the configurable overlay hotkey (#687), the guided-diagnostic detection watchdog
> (#688), the Rich Presence sync (#684), and the lobby alliance hint (#683).

## Bootstrap

`main.ts` branches on `isOverlayWindow()` (Tauri window label `"overlay"`):
- **Overlay window** → mounts `OverlayView.vue` bare — no router, no auth, no chrome.
- **Main window** → mounts `App.vue`, initializes Keycloak (`keycloakStore.init`), registers the
  `click-outside` directive, starts the router, and kicks off `startOverlayBroadcaster()` +
  `startPresenceSync()`.

`router/index.ts` (`createWebHistory`): `/` → `AuthenticationComponent`; `/fleet` →
`FleetMenuNavigator` shell with children `session` → `FleetComponent`, `config` →
`ConfigComponent`, `report` → `ReportsComponent`. `beforeEach` bounces `requiresAuth` routes to auth
when Keycloak isn't authenticated; `meta.displayInNav` drives the nav bar.

## Client object model (`webapp/src/objects/`)

### stores/
- **`UserStore.ts`** — the central reactive singleton. `UserStore.player: Player` holds the local
  user, all preferences, and the live `Fleet`. `init()` merges saved localStorage prefs over
  defaults and seeds locale/country from the browser. `setLang()` updates **both** i18n instances.
- **`LocalStore.ts`** — a `customRef` factory over `localStorage` (`enum LocalKey`).
- **`LoginStates.ts`** — Keycloak (`keycloak-js`). `keycloakStore` (realm `Betterfleet`, client
  `application`, url from `VITE_KEYCLOAK_HOST`). `init()` does `check-sso`, loads the username;
  `onTokenExpired` → `HTTPAxios.updateToken()`.

### fleet/
- **`Fleet.ts`** — **the WebSocket session client** and the richest object. `joinSession(id)` refreshes
  the token, GETs `socket/register` for a one-time token, opens the socket, and wires
  `onopen/onmessage/onerror/onclose`. Sends `CONNECT` on open (empty `sessionId` = create). The
  `onmessage` switch handles `UPDATE`, `RUN_COUNTDOWN`, `OUTDATED_CLIENT`, `SESSION_NOT_FOUND`,
  `CONNECTION_REFUSED`. Outbound helpers: `updateToSession`, `playerAction` (promote/demote/kick),
  `runCountDown`, `renameSession`, `setVisibility`, `clearPlayersStatus`, `joinServer`/`leaveServer`,
  `sendKeepAlive`, plus the client-only `autoSetSail` latch.
- **`WebSocet.ts`** (misspelled, no second `k`) — **only** the `WebSocketMessage` interface + the
  `WebSocketMessageType` enum. The actual client is in `Fleet.ts`, not here — easy to mis-cite.
- **`Player.ts`** — `interface Player extends Preferences` + enums `PlayerStates`
  (CLOSED/STARTED/MAIN_MENU/IN_GAME), `PlayerDevice`, `BoatSize`. `Preferences` = lang, country,
  sound, macro, banner, bannerShuffle, shareStats, richPresence, overlayHotkey.
- **`Overlay.ts`** — the in-game overlay (#671). `OverlaySnapshot`/`OverlayServer`/`OverlayPlayer`
  types, `isOverlayWindow()`, `computeSnapshot()` (builds the compact snapshot from `UserStore`),
  `startOverlayBroadcaster()` (main window emits `overlay:update` every 1s), `onOverlayUpdate()`
  (overlay window subscribes), `setOverlayVisible`/`isOverlayVisible`, `hotkeyLabel()` +
  `DEFAULT_OVERLAY_HOTKEY`. The toggle shortcut is configurable (#687): the player's `overlayHotkey`
  is (re)bound in Rust via `invoke("set_overlay_hotkey")`; the default is `CommandOrControl+Shift+O`.
- **`DetectionWatchdog.ts`** — the guided-diagnostic offer (#688): the pure `DetectionWatchdog` class
  fires once after detection stays silent in game past `DETECTION_PROMPT_AFTER_MS`; `observeDetection`
  is fed by the 400ms poll, `detectionPrompt` is the reactive banner state. (Dev builds expose
  `betterfleet.detection.offer()` / `.simulateStuck()` on the console.)
- **`WhatsNew.ts`** + `components/WhatsNewModal.vue` — the after-update changelog modal (#686): fetches
  the installed tag's release notes from the GitHub API (through the Tauri http plugin) and shows them
  once per new version (last-seen tracked in `LocalStore`).
- **`PublicSessionsStore.ts`** — the public-session **browser** store (reactive singleton).
  `refresh()` = REST `GET public-sessions`; `connectStream()` = SSE `EventSource` on
  `/public-sessions/stream` with a **mixed-content guard** and a 5s **poll backstop**. This is what
  `PublicSessionsStream.spec.ts` tests — there is no `PublicSessionsStream.ts`.
- **`GameSync.ts`** — pure `syncGameState(rustSotServer, player, fleet)`: the detection → join/leave
  state machine (#364). `interface FleetActions` is the testable seam.
- **`PresenceSync.ts`** — Discord Rich Presence (#684): pure `buildPresence()` + `startPresenceSync()`
  (5s diff loop, `invoke("update_presence" / "clear_presence")`).
- **`AllianceHint.ts`** — the lobby "best time to try" hint (#683): cached (1h) `GET stats/alliance`
  + pure `computeHint()` / `bestWindow()` / `utcHourToLocal()`.
- Smaller: `PublicSessions.ts` (DTO), `PublicSessionsFilter.ts` (`applyFilter`), `PublicSessionName.ts`
  (localized names), `SotServer.ts` (+ `RustSotServer`), `ServerColor.ts`, `Banners.ts`,
  `BoatIcons.ts`, `SessionRunner.ts`.

### report/, i18n/, utils/
- **`report/Report.ts`** — `BugReport.sendReport()` = REST `POST report/send`.
- **`i18n/index.ts`** — the second i18n instance `tsi18n`, for `.ts` files outside components.
- **`utils/HTTPAxios.ts`** — **not axios.** Wraps the **Tauri http plugin** (`@tauri-apps/api/http`
  `fetch`), base url `VITE_BACKEND_HOST`, static `Authorization` header + `updateToken()`. This is
  the guaranteed REST path (goes through Rust).
- `utils/Utils.ts` (`parseRustPlayerStatus`), `utils/BrowserCountry.ts` (#672), `utils/LangIcons.ts`.

## The Tauri bridge (JS `invoke` ↔ Rust)

`webapp/src-tauri/src/main.rs` exposes **13** `#[tauri::command]` fns. The frontend currently calls
nine of them:

| Command | Caller | Purpose |
|---|---|---|
| `get_game_object` | `FleetMenuNavigator.vue` | Poll game ip/port/status → `syncGameState` (bundles the `get_server_*`/`get_game_status` reads) |
| `play_countdown_sound` | `SessionCountdown.vue` | Native countdown jingle (webview audio is suspended behind the game) |
| `rise_anchor` | `SessionCountdown.vue` | Focus the SoT window + click "raise anchor" |
| `run_server_diagnostic` | `ReportsComponent.vue` | UDP-flow capture for detection debugging (#364) |
| `get_logs` | `ReportsComponent.vue` | Read rotated log files (for bug reports) |
| `get_system_info` | `ReportsComponent.vue` | System/network dump (for bug reports) |
| `update_presence` / `clear_presence` | `PresenceSync.ts` | Discord Rich Presence (#684) |
| `set_overlay_hotkey` | `ConfigComponent.vue` | Re-bind the overlay-toggle global shortcut (#687) |

`get_game_status`, `get_server_ip`, `get_server_port`, `get_last_updated_server_ip` exist but are
bundled into `get_game_object`. Native logic lives in `api.rs` / `fetch_informations.rs` (detection),
`diagnostics.rs` (UDP capture), `window_interaction.rs` (focus/click). The overlay toggle is a
`CommandOrControl+Shift+O` global shortcut by default, re-bindable via `set_overlay_hotkey` (#687),
registered in `main.rs` `setup()`.

**Overlay snapshot event bus** (Tauri `emit`/`listen`, defined in `Overlay.ts`, consumed in
`OverlayView.vue`): `overlay:update` (main → overlay, the snapshot, every 1s + on request),
`overlay:request` (overlay → main, "send me a snapshot now" on mount), `overlay:toggle-ready`
(overlay → main, local player flipped ready).

## Talking to the backend

Env hosts: `VITE_BACKEND_HOST` (REST), `VITE_SOCKET_HOST` (WS), `VITE_KEYCLOAK_HOST` — see
`webapp/.env.development` / `.env.production`.

- **WebSocket** (`Fleet.ts`): the live fleet session (create/join, ready, countdown, join/leave,
  master actions, rename/visibility, keep-alive). Messages are `{messageType, data}` JSON.
- **REST via `HTTPAxios`** (through Rust): `GET socket/register`, `GET public-sessions`,
  `GET stats/alliance`, `POST report/send`. The guaranteed path.
- **SSE** (`EventSource`, webview-native, bypasses Rust): `GET public-sessions/stream` — an
  optimization only, backstopped by the 5s poll and skipped under mixed content (all local dev).
- **Rust `invoke`**: detection, sound/macro, logs/system-info/diagnostics, Discord presence.

## Components

`webapp/src/components/` (routes/features):
- **`FleetMenuNavigator.vue`** — the `/fleet` shell. Runs the two core loops: token refresh (1s) and
  `get_game_object` detection → `syncGameState` (400ms). Clears intervals + leaves session on unmount.
- **`fleet/ConfigComponent.vue`** — the settings form (language, device, boat size, banner+shuffle,
  sound, macro, shareStats, Discord presence, overlay show/hide, backend host). `SaveBar` +
  `isConfigDifferent()`; persists into `UserStore.player`. Dense — many conventions converge here.
- **`fleet/session/FleetLobby.vue`** — the in-session lobby (server groupings, ready button, master
  controls, alliance hint, countdown, keep-alive).
- **`fleet/session/SessionCountdown.vue`** — full-screen launch countdown; pokes
  `play_countdown_sound`, fires `rise_anchor` at zero, blocks route-leave while running.
- **`fleet/session/PublicSessionBrowser.vue`** — filter + search + animated list of `SessionRow`;
  mounts/unmounts the `PublicSessionsStore` stream.
- **`OverlayView.vue`** + `OverlayPlayerRow.vue` — the overlay window UI.
- **`ReportsComponent.vue`** — FAQ/Discord, bug report, UDP diagnostic capture.

`webapp/src/vue/` (reusable primitives):
- **form/**: `InputText.vue` (`defineModel("inputValue")`, clear button), `SingleSelect.vue` (custom
  dropdown — caller owns the state, emits `update:data`, uses `v-click-outside`), `InputSlider.vue`,
  `ConfirmationModal.vue`, `Inputs.ts` (`SingleSelectInterface`).
- **templates/**: `ParameterPart.vue` (titled bordered settings section — see the layout trap in
  [gotchas.md](gotchas.md)), `BannerTemplate.vue` (header artwork, `content`/`left-content` slots),
  `ModalTemplate.vue` (`defineModel("isModalOpen")`).
- **alert/**: `Alert.ts` — `AlertProvider` (`sendAlert`, auto-dismiss 5s, `handleError(status)`),
  `AlertType` (VALID/ERROR/WARNING). Provided app-wide as `"alertProvider"` (inject it in components;
  it's also re-exported from `main.ts` for `.ts` modules like `Fleet.ts`).

## i18n

Two `createI18n` instances (both `legacy:false`, locale `fr`, fallback `en`, same six messages): the
component-facing `i18n` in `main.ts` and `tsi18n` in `objects/i18n/index.ts` (for non-component `.ts`
like `Fleet.ts`). `UserStore.setLang()` updates both. Components use `const { t } = useI18n()`; `.ts`
modules use `tsi18n.global.t`. Dynamic keys are built by concatenation, e.g.
`t("boatSize." + size)`, `t("session.name." + seed)`. Locale files and the editing rules are in
[conventions.md](conventions.md); the parity test is `objects/i18n/Locales.spec.ts`.

## Test harness (`webapp/src/test/harness/`)

Vitest. Specs drive the app end-to-end without a Tauri shell or a server. The **rule**: call the
mock factories with `vi.mock(...)` at the **top of the spec, before importing the code under test**
(importing any module that pulls the `@/main.ts` chain first will break the mocks).

- **`tauri.ts`** — `httpMock()` (`@tauri-apps/api/http`), `logMock()` (`tauri-plugin-log-api`),
  `invokeMock()` (`@tauri-apps/api/tauri` — records `rustCalls`, answers from `rustResponses`),
  `mainMock()` (stubs `@/main.ts` with a fake `alertProvider`), `keycloakMock()` (static token),
  `eventMock()` / `windowMock()` (in-memory Tauri event bus + window/overlay stubs).
  `installFakeTransports()` (in `beforeEach`) swaps global `WebSocket`/`EventSource` for the fakes.
- **`FakeBackend.ts`** — an in-memory backend mirroring the **real server contract** (REST
  `public-sessions` + `socket/register`, SSE stream, the WS message handler with the same refusals
  and master checks). Its docstring: "If a test passes here and fails in production, this file is what
  should be corrected."
