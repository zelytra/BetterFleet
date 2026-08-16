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
- **WebKitGTK can glitch the whole Linux window to black until relaunch.** Its DMABUF renderer
  (webkit2gtk 2.42+) fails to repaint on a range of driver/compositor stacks, typically after the
  window was occluded or moved across screens/workspaces. `main.rs` sets
  `WEBKIT_DISABLE_DMABUF_RENDERER=1` (before GTK init, only when unset, so it stays overridable) to
  fall back to the shared-memory path. Don't remove it because "it works on my GPU" - the glitch is
  stack-dependent and reported from the field.
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
- **Linux UDP capture needs `CAP_NET_RAW`, isolated in the `betterfleet-netcap` helper (#726).**
  Server detection sniffs the game's UDP flows through an `AF_PACKET` socket (`diagnostics.rs`,
  `capture_af_packet`), shared verbatim by live detection (`fetch_informations.rs`) and the Help-tab
  "Lancer une capture" diagnostic through `capture_flows`. Because that socket needs `CAP_NET_RAW`,
  the capture runs in a **separate Tauri-free binary** (`betterfleet-netcap`, crate
  `better_fleet_netcap`) rather than the GUI: the app stays unprivileged, `capture_flows` shells out
  to the helper, and it falls back to an in-process capture when the helper is absent or uncapped.
  **Dev**: `npm run tauri:dev` builds the helper and `setcap cap_net_raw+ep`s it via
  `webapp/scripts/netcap-dev.mjs` (it calls `sudo`, so a passwordless setcap rule keeps startup
  non-interactive; a failed setcap is non-fatal, leaving the in-process fallback). **Packaged**: the
  `.deb`/`.rpm` post-install (`webapp/src-tauri/deb/postinst.sh`) and the pacman package's `.install`
  (`deployment/aur/betterfleet-bin/betterfleet-bin.install`) setcap the helper, so end users never
  touch it. Without the capability the socket fails `EPERM`, the capture returns no flows, and
  detection degrades to "no server" instead of crashing (the Help-tab report shows zero packets).
- **Host silence never wipes the session identity (#832).** Detection separates STATUS from
  IDENTITY: past the 12s grace the player is shown in the menu, but the locked session and its
  accumulated flows are held (`DetectionState`, `fetch_informations.rs`) so a false exit resumes
  with the same server - report #854 showed a client re-rolling its identity 50 times in one
  continuous game when the reset also wiped the accumulator. Liveness is judged on the game's
  SOCKET (any plausible packet on the connection's local port), not on the `MIN_SERVER_PACKETS`
  per-window floor, and a host-IP change on the same local port is an SDR reroute, not a new game.
  Only two things forget: the game process exiting, and a NEW local socket clearing the floor (a
  genuinely new server - the #364 lesson, with its teardown quarantine and 2x relock intact). The
  forgetting rules are unit-tested; don't reintroduce a wipe on the silence path.
- **Proton spreads the game's UDP sockets, so candidate ports are unioned (#725).** Under Proton the
  ~100 `sotgame.exe` "task" PIDs share one command line but only one owns the UDP sockets, and
  `wineserver` (a sibling process) can own others. Detection resolves every game task PID plus
  `wineserver` and unions their UDP ports in a single socket scan; reading only the first PID
  intermittently missed the real server port. The pure union step is unit-tested
  (`fetch_informations.rs`, `udp_ports_owned_by`).
- **No AppImage: it can't hold a file capability, so detection would never work from it.** A file
  capability lives in an on-disk binary's extended attributes; an AppImage runs from a self-mounted,
  read-only image, so `setcap` has nothing to pin to and the helper never receives `CAP_NET_RAW`.
  Rather than ship a build whose core feature is silently broken, the Linux bundle targets are the
  packaged installs that `setcap` the helper on install: `.deb` (Debian/Ubuntu), `.rpm` (Fedora), and
  the pacman package (Arch). The `.deb` and `.rpm` share one post-install script
  (`webapp/src-tauri/deb/postinst.sh`, wired as `postInstallScript` for both bundle targets); the
  pacman package runs its own `deployment/aur/betterfleet-bin/betterfleet-bin.install`. Windows keeps
  its `.exe` (NSIS). MSI is not built.

## Dev vs prod transport

- **SSE looks broken in dev: it isn't.** The webview's origin is `https://tauri.localhost` while the
  dev backend is plain `http`, so the browser blocks `EventSource` as mixed content. The client
  **silently falls back to polling** (you'll see `/public-sessions` GETs loop every ~5s in dev logs).
  Production is same-origin HTTPS, so SSE connects and the poll idles. This is not a regression and
  the loop is bounded to the sessions-browser page (connect on mount, disconnect on unmount).
- **A persisted `serverHostName` used to silently shadow `VITE_SOCKET_HOST` in dev.** A value saved
  to localStorage on an earlier run won over the env, so repointing the app at another backend left
  the WebSocket talking to the old host while HTTP moved with the env (the `serverHostName` default in
  `UserStore.init()`, `webapp/src/objects/stores/UserStore.ts`). It's now gated on
  `import.meta.env.MODE === "development"`: dev always follows `VITE_SOCKET_HOST`, while prod /
  self-host builds still honour the persisted override. Deliberately **`MODE`, not `DEV`**, so the
  vitest run (mode `test`) keeps restoring the persisted value; don't "simplify" it to
  `import.meta.env.DEV`.

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
- **Sign-in is the system browser + a loopback OAuth on a fixed port — on every platform.** The app
  signs in the RFC 8252 way (`webapp/src/objects/stores/BrowserAuth.ts`, formerly `LinuxAuth.ts`):
  it opens the hosted Keycloak page in the **system browser**, captures the code on a **loopback
  server at the fixed port 47823** (`REDIRECT_PORT`, redirect `http://localhost:47823/callback`)
  with **PKCE**, and runs the token exchange from **Rust via `@tauri-apps/plugin-http`**. The
  `offline_access` scope yields a refresh token **persisted to localStorage**, so a session survives
  a restart and slides Keycloak's 30-day offline-idle window on every refresh. That is the fix for
  the recurring dead-session reports: the old in-webview `keycloak-js` login kept nothing on disk
  and leaned on the webview's SSO cookie, so anything that dropped it (a cleared webview profile, a
  session cap, a reinstall) meant a full re-login. `keycloak-js` is gone entirely
  (`keycloakStore.keycloak` is a plain token holder with the same shape). A refresh that fails
  because Keycloak is **unreachable** must never delete the stored token or sign the player out —
  only an actual rejection ends a session (`RefreshUnavailableError`). The realm must register
  `http://localhost:47823/callback` as a valid redirect URI; don't reintroduce a webview-hosted
  login.

## Release & packaging

- **pacman `pkgver` forbids `-`, so a pre-release asset name won't match its tag.** `publish-arch`
  maps the semver pre-release dash to a dot when it pins `pkgver` (`.github/workflows/release.yml`,
  the `pkgver` substitution step): tag `v2.3.0-rc.3` ships as
  `betterfleet-bin-2.3.0.rc.3-x86_64.pkg.tar.zst`, not `...-2.3.0-rc.3-...`. Anything that derives the
  pacman asset name from the raw tag (or the tag from the asset) has to account for that `-`→`.`
  substitution.
- **A pre-release tag suppresses everything "latest".** Any semver pre-release suffix on the tag
  (`v2.3.0-rc.1`) sets `prerelease=true` in the `resolve-version` job
  (`.github/workflows/release.yml`), and the pipeline keys off it: no updater `latest.json`, no Docker
  `:latest` (the RC images are tagged by version only), and `sync-version-to-master` does not bump the
  version on `master`. The exception is `publish-arch`: it still attaches the pacman package to the
  pre-release, by design (nobody's `pacman -U` picks it up by surprise). A stable tag turns all of
  that back on.

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
