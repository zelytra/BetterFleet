# Recipes

Step-by-step playbooks for the changes that come up most often. Each lists every file you must touch —
the usual time sink is missing one of them (a locale key, a handler registration, the other side of
the bridge).

## Add or change a translated string

1. Edit **`webapp/src/assets/locales/source.json`** — add/change the key. This is the only file you
   edit by hand.
2. Add the **same key** to `en.json`, `fr.json`, `es.json`, `de.json`, `it.json`. Edit **in place**;
   never reformat the whole file (it reorders integer-keyed maps). Real translations for fr; the
   others can hold the English text until Crowdin corrects them.
3. Use it: `t("your.key")` in a component, `tsi18n.global.t("your.key")` in a `.ts` module.
4. Run `npm run test` — `Locales.spec.ts` fails if any locale is missing the key.

The website has its own locale set under `website/src/` — same rules there.

## Add a setting to the settings screen

Settings live in **`webapp/src/components/fleet/ConfigComponent.vue`** and persist automatically via
`UserStore` → `localStorage`.

1. **Model** — add the field to `Preferences` in `webapp/src/objects/fleet/Player.ts` (make it
   optional, `foo?: boolean`, so existing saved prefs and test fixtures don't need it).
2. **Default** — set it in `UserStore.init()` defaults (`webapp/src/objects/stores/UserStore.ts`) if
   it needs a non-falsy default. (An "absent means on" opt-out reads cleanest as
   `foo.value = player.foo !== false`.)
3. **UI** — in `ConfigComponent.vue`: add a `ref`, render a control (copy an existing
   `.checkbox-wrapper.descriptor` toggle or a `SingleSelect`), and wire the three lifecycle points:
   `resetConfig()` (load the value), `onSave()` (write it back to `UserStore.player`),
   `isConfigDifferent()` (dirty-check so the `SaveBar` appears). **If the section has more than one
   control, put them in a full-width column** — see the `ParameterPart` trap in [gotchas.md](gotchas.md).
4. **Strings** — add `config.<name>.check` / `config.<name>.description` per the locale recipe.
   Settings copy avoids em-dashes.
5. **If it must reach the backend** (travels on the session `CONNECT`), also add the field to the
   backend `Player` (`backend/src/main/java/fr/zelytra/session/player/Player.java`).
6. **Verify visually** — render the section and confirm alignment before merging.

## Add a native capability (Tauri command)

1. **Rust** — add `#[tauri::command] fn my_command(...) -> Result<T, String>` in
   `webapp/src-tauri/src/main.rs` (or a submodule re-exported into it).
2. **Register it** — add the name to the `tauri::generate_handler![ … ]` list in `main.rs`. Forgetting
   this is the classic failure: the command compiles but `invoke` rejects at runtime.
3. **Call it** — `invoke<ReturnType>("my_command", { arg1, arg2 })` from the client
   (`@tauri-apps/api/tauri`). Keep pure logic in a testable `.ts` module and mock the invoke in specs
   (`invokeMock()` records into `rustCalls`, answers from `rustResponses`).
4. **Build/check** — on Windows, `cargo check`/`cargo test` in `webapp/src-tauri/` need
   `BETTERFLEET_TEST_BUILD=1` (see [gotchas.md](gotchas.md)).

## Add an in-session action (WebSocket message)

A session action touches both sides of the socket.

1. **Protocol enum, both sides** — add the value to `MessageType`
   (`backend/src/main/java/fr/zelytra/session/socket/MessageType.java`) **and** `WebSocketMessageType`
   (`webapp/src/objects/fleet/WebSocet.ts`). Keep the names identical.
2. **Server handler** — add a `case` in `SessionSocket.onMessage`
   (`backend/src/main/java/fr/zelytra/session/SessionSocket.java`) that deserializes `data` and calls
   a handler. **Authorize from the requester's own socket identity** (resolve the player from their
   session id, check `isMaster()` / same-fleet) — never trust a client-asserted role.
3. **Broadcast** — mutate state in `SessionManager` under the right lock (`@Lock(WRITE)` for changes)
   and call `broadcastDataToSession(sessionId, MessageType.UPDATE, …)`. **No blocking I/O under the
   WRITE lock** (see [gotchas.md](gotchas.md)). If it changes the public directory, call
   `publishDirectoryChange()`.
4. **Client send** — add an outbound helper in `Fleet.ts`
   (`webapp/src/objects/fleet/Fleet.ts`) that sends `{messageType, data}`.
5. **Client receive** — handle the server's reply in the `Fleet.ts` `onmessage` switch (most changes
   arrive as an `UPDATE` snapshot).
6. **Test** — extend `FakeBackend.ts`'s WS handler to mirror the new server behavior, then assert the
   client reaction. If it passes in `FakeBackend` but fails in prod, fix `FakeBackend` — it is meant
   to track the real contract.

## Add a REST endpoint

1. **Backend** — add a JAX-RS method to the relevant resource (or a new `@Path` class) under
   `backend/src/main/java/fr/zelytra/…`. Mark it `@Authenticated` only if it truly needs the user's
   identity — most read endpoints here are public. Return a record/DTO (Jackson-serialized).
2. **Persist** if needed — a Panache entity (`extends PanacheEntity`) or repository; schema is
   auto-managed (`database.generation=update`).
3. **Client** — call it through `HTTPAxios.get/post` (`webapp/src/objects/utils/HTTPAxios.ts`), which
   routes through the Tauri http plugin and attaches the bearer token. The website uses its own fetch.
4. **Test** — a `@QuarkusTest` on the H2 `%test` profile (`./mvnw test`); use `rest-assured`.

## Add a public statistics data point

1. **Record** it in the backend where the event happens (`SessionManager` for session events) —
   either a daily counter (`StatisticsEntity`, one row/day) or, for anonymous per-countdown
   analytics, extend the `AllianceAttempt` pipeline (build it in the **pure** `buildAttempt` so it
   stays unit-testable, and keep it identifier-free).
2. **Serve** it from `StatsEndpoints` or `AllianceStatsEndpoints` (`/stats/*`).
3. **Show** it in `website/` (the public dashboard) and/or `webapp/` (e.g. the lobby hint via
   `AllianceHint.ts`).

## Ship a release

Push a `v*` tag (or run the "Publish" workflow manually). The pipeline resolves the version, runs the
`verify` test gate, then publishes the Tauri app, backend, and website, and syncs the version back to
`master`. Confirm secrets and branch protection first — see [workflows.md](workflows.md).
