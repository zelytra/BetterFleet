# Gotchas

The non-obvious traps that cost hours if you don't know them. Each is deliberate: don't "fix" them
back into the problem.

## Desktop shell (Tauri)

- **Tauri is on v2** (migrated for the Linux port, #735). Don't reintroduce v1 assumptions: config is
  the v2 schema (top-level `identifier`/`productName`, `build.frontendDist`/`devUrl`, `plugins.updater`,
  capabilities instead of `allowlist`), and `tauri-action` is pinned to **`@v1`**: do **not** drop it
  back to `@v0` (v0 rejects the v2 config with "base config has no bundle identifier").
- **Updater signing env vars are the v2 names.** CI must export `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (the v1 `TAURI_PRIVATE_KEY` / `TAURI_KEY_PASSWORD` are silently
  ignored). With the old names the build produces no signature and every client rejects the update.
- **`cargo test` / `cargo check` on Windows need `BETTERFLEET_TEST_BUILD=1`.** The release build
  embeds a `requireAdministrator` manifest (`webapp/src-tauri/build.rs`); without the env var the
  test binary fails to launch with **OS error 740** (elevation required). Set it and the manifest
  requirement is dropped for the build.
- **The overlay window freezes while hidden behind the game.** WebView2 throttles occluded/background
  windows: timers stall and audio mutes. The fix is `additionalBrowserArgs` in
  `webapp/src-tauri/tauri.conf.json` (the `WEBVIEW2_*` env var is **ignored by wry**, so it must be
  in the config). Native audio is played from Rust (`rodio`, embedded mp3) precisely because the
  webview can't be relied on to play sound while occluded. Don't move timer/audio logic back into the
  webview assuming it keeps ticking while covered.
- **Linux native integration is X11-first, and the overlay needs active stacking help (#731).** The
  set-sail auto-click (`rise_anchor`) and the overlay float are Linux paths gated to `target_os =
  "linux"` (`window_interaction_linux.rs`, `overlay_x11.rs`, shared `x11_support.rs`); Windows/macOS
  are untouched. The click finds the game via EWMH `_NET_CLIENT_LIST` and injects a pointer move +
  left click with **XTEST** at the same 16:9-letterboxed coordinates as Windows; it reaches a
  Proton/Wine game (native or through XWayland) but **not a native-Wayland client**, where Wayland
  forbids synthetic input; `rise_anchor` then returns `false` and the frontend keeps its manual cue.
  The overlay is a *managed* X11 window, so the WM restacks it below whatever is focused and KWin
  hides inactive "utility" windows: it appears to vanish the moment the game takes focus. The fix
  re-asserts `_NET_WM_STATE_ABOVE`/`STICKY`/`SKIP_TASKBAR`/`SKIP_PAGER` on show **and on main-window
  blur** (`WindowEvent::Focused(false)`); don't drop the blur re-assert thinking `alwaysOnTop` alone
  holds. A **fullscreen-exclusive** game can still cover it (its layer outranks "above"); borderless
  / windowed-fullscreen is the workaround. The WebView2 `additionalBrowserArgs` occlusion knob is a
  no-op on WebKitGTK; the native `rodio` countdown audio already hedges the important cue.
- **Linux UDP capture needs `CAP_NET_RAW`, a dev-only manual step until #726.** Server detection
  sniffs the game's UDP flows through an `AF_PACKET` socket (`diagnostics.rs`, `capture_af_packet`),
  shared verbatim by both the live detection (`fetch_informations.rs`) and the Help-tab "Lancer une
  capture" diagnostic through `capture_flows`. That socket requires `CAP_NET_RAW`. In dev, grant it
  once to the compiled binary with
  `sudo setcap cap_net_raw+ep webapp/src-tauri/target/debug/better_fleet`, then re-apply it after any
  Rust rebuild: cargo relinks a fresh binary and the capability stays on the old inode, so it is
  lost, while a frontend-only reload keeps it. Without the capability the socket fails with `EPERM`;
  the capture logs the error and returns no flows, so detection degrades to "no server" instead of
  crashing (the Help-tab report simply shows zero packets). End users never run setcap: the
  production model (issue #726) keeps the app unprivileged and gives the capability to a small
  capture helper, granted by the package's post-install.

## Dev vs prod transport

- **SSE looks broken in dev: it isn't.** The webview's origin is `https://tauri.localhost` while the
  dev backend is plain `http`, so the browser blocks `EventSource` as mixed content. The client
  **silently falls back to polling** (you'll see `/public-sessions` GETs loop every ~5s in dev logs).
  Production is same-origin HTTPS, so SSE connects and the poll idles. This is not a regression and
  the loop is bounded to the sessions-browser page (connect on mount, disconnect on unmount).

## Frontend layout

- **`ParameterPart` centre-wraps its slot children.** Its `.template-wrapper` is a
  `flex-wrap: wrap; justify-content: center` row, so dropping several controls straight into a
  settings section lands them on differently-offset lines with ragged left edges. Any section with
  more than one control wraps them in a **full-width column** first: see `.general-layout` and
  `.overlay-layout` in `webapp/src/components/fleet/ConfigComponent.vue`. This is the single most
  common settings-screen mistake.

## Auth

- **Login is a self-registered Keycloak account.** The realm also has a Microsoft/Xbox identity
  provider configured, but it has never worked, so don't treat it as the sign-in path or document it as
  one. Keycloak realm `Betterfleet`, OIDC client `application`.

## Backend concurrency (`SessionManager`)

- **No blocking I/O under a WRITE lock, ever, and nothing blocking on the vert.x event loop.**
  `SessionManager` is `@ApplicationScoped @Lock`; reads are `@Lock(READ)`, mutations `@Lock(WRITE)`,
  I/O helpers `@Lock(NONE)`. Geolocation (proxycheck.io) is deliberately run off-thread via
  `GeoLocationResolver` and the result re-applied under WRITE with `applyServerGeo`. Doing the lookup
  inline under the lock has caused a real incident: players kicked at countdown end and the server
  hidden from the list. If you add anything that touches the network or disk in this class, push it
  off-thread the same way.
- **The public-sessions SSE stream must keep `.onOverflow().dropPreviousItems()`.** In
  `SessionManager.streamPublicSessions()`, the `BroadcastProcessor` feeding each SSE subscriber will
  terminate a slow subscriber with a `BackPressureFailure` if overflow isn't handled; their session
  list then silently freezes with no error surfaced. Don't remove that operator when refactoring.
- **`handleSocketClose` swallows its exceptions on purpose.** It avoids an `@OnError` → `onError`
  re-entrancy that otherwise produces `LockException` storms. Keep the catch.
