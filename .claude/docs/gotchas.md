# Gotchas

The non-obvious traps that cost hours if you don't know them. Each is deliberate — don't "fix" them
back into the problem.

## Desktop shell (Tauri)

- **Tauri stays on v1.** The `tauri*` crates must stay v1 and `tauri-action` must stay `@v0`. A v2
  bump dies with a cryptic `devPath`/config error, not an obvious "wrong version" message. This pin
  is intentional.
- **`cargo test` / `cargo check` on Windows need `BETTERFLEET_TEST_BUILD=1`.** The release build
  embeds a `requireAdministrator` manifest (`webapp/src-tauri/build.rs`); without the env var the
  test binary fails to launch with **OS error 740** (elevation required). Set it and the manifest
  requirement is dropped for the build.
- **The overlay window freezes while hidden behind the game.** WebView2 throttles occluded/background
  windows — timers stall and audio mutes. The fix is `additionalBrowserArgs` in
  `webapp/src-tauri/tauri.conf.json` (the `WEBVIEW2_*` env var is **ignored by wry**, so it must be
  in the config). Native audio is played from Rust (`rodio`, embedded mp3) precisely because the
  webview can't be relied on to play sound while occluded. Don't move timer/audio logic back into the
  webview assuming it keeps ticking while covered.

## Dev vs prod transport

- **SSE looks broken in dev — it isn't.** The webview's origin is `https://tauri.localhost` while the
  dev backend is plain `http`, so the browser blocks `EventSource` as mixed content. The client
  **silently falls back to polling** (you'll see `/public-sessions` GETs loop every ~5s in dev logs).
  Production is same-origin HTTPS, so SSE connects and the poll idles. This is not a regression and
  the loop is bounded to the sessions-browser page (connect on mount, disconnect on unmount).

## Frontend layout

- **`ParameterPart` centre-wraps its slot children.** Its `.template-wrapper` is a
  `flex-wrap: wrap; justify-content: center` row, so dropping several controls straight into a
  settings section lands them on differently-offset lines with ragged left edges. Any section with
  more than one control wraps them in a **full-width column** first — see `.general-layout` and
  `.overlay-layout` in `webapp/src/components/fleet/ConfigComponent.vue`. This is the single most
  common settings-screen mistake.

## Auth

- **Login is a self-registered Keycloak account.** The realm also has a Microsoft/Xbox identity
  provider configured, but it has never worked — don't treat it as the sign-in path or document it as
  one. Keycloak realm `Betterfleet`, OIDC client `application`.

## Backend concurrency (`SessionManager`)

- **No blocking I/O under a WRITE lock, ever, and nothing blocking on the vert.x event loop.**
  `SessionManager` is `@ApplicationScoped @Lock`; reads are `@Lock(READ)`, mutations `@Lock(WRITE)`,
  I/O helpers `@Lock(NONE)`. Geolocation (proxycheck.io) is deliberately run off-thread via
  `GeoLocationResolver` and the result re-applied under WRITE with `applyServerGeo`. Doing the lookup
  inline under the lock has caused a real incident — players kicked at countdown end and the server
  hidden from the list. If you add anything that touches the network or disk in this class, push it
  off-thread the same way.
- **The public-sessions SSE stream must keep `.onOverflow().dropPreviousItems()`.** In
  `SessionManager.streamPublicSessions()`, the `BroadcastProcessor` feeding each SSE subscriber will
  terminate a slow subscriber with a `BackPressureFailure` if overflow isn't handled — their session
  list then silently freezes with no error surfaced. Don't remove that operator when refactoring.
- **`handleSocketClose` swallows its exceptions on purpose.** It avoids an `@OnError` → `onError`
  re-entrancy that otherwise produces `LockException` storms. Keep the catch.
