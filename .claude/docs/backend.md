# Backend (`backend/`)

Quarkus 3 (Java 17, Maven via `./mvnw`). Real-time alliance sessions over **WebSocket**, plus REST
for the public sessions browser, anonymous statistics, diagnostic reports, and a GitHub release
proxy. Config in `backend/src/main/resources/application.properties`. Everything lives under
`backend/src/main/java/fr/zelytra`.

## Package map

| Package | Responsibility |
|---|---|
| `PublicEndpoints` (root) | Health check `GET /` → `"Pong!"` |
| `session` | The engine: `SessionSocket` (WS endpoint), `SessionManager` (in-memory state + locking), `SessionDirectoryEndpoints` (public-sessions REST + SSE) |
| `session.fleet` | Session/lobby domain: `Fleet` (a session = a fleet of players + tracked servers), `FleetStats` (in-memory try counter), `PublicSession`/`PublicSessionsSnapshot` DTOs, `SessionNameFilter` (custom-name content filter, #604) |
| `session.player` | `Player` (mutable connected player, owns its `jakarta.websocket.Session`), `PlayerAction` record, enums `PlayerStates` / `PlayerDevice` / `BoatSize` |
| `session.server` | `SotServer` (a detected SoT server: ip/port hash, players, geo/country), `SotServerMessage` record |
| `session.socket` | Wire protocol: `SocketMessage<T>` record, `MessageType` enum, `MessageDecoder`/`MessageEncoder` (JSR-356) |
| `session.socket.security` | WS handshake auth: `SocketSecurityEndpoints` (`@Authenticated GET /socket/register`), one-time 30s UUID tokens in an in-memory map |
| `session.ip` | Geolocation: `ProxyCheckAPI` (proxycheck.io), `GeoLocationResolver` (runs lookups off the event loop on a dedicated pool) |
| `reports` | `ReportEndpoints` (`/report`), `ReportEntity` (table `reporting`) — the diagnostic/feedback reports |
| `statistics` | Two stat systems (see below): daily counters + anonymous alliance analytics |
| `github` | Self-update proxy: `GithubApi` (fetches Tauri `latest.json` at startup), `GithubRest` (`/github/release/download`) |

## Real-time sessions (WebSocket)

**Endpoint:** `@ServerEndpoint("/sessions/{token}/{sessionId}")` — `session/SessionSocket.java`. An
empty `sessionId` means "create a new session and become its master".

**Handshake:**
1. Client calls authenticated `GET /socket/register` → receives a one-time UUID token (valid 30s).
2. `@OnOpen` arms a 1-second timeout that closes the socket unless a message arrives.
3. Client sends `CONNECT`; the server validates the token (then **deletes it — single use**), checks
   the client version against the `app.version` allowlist (else `OUTDATED_CLIENT` /
   `CONNECTION_REFUSED`), and joins/creates the fleet.

**Protocol** — `SocketMessage<T> { messageType, data }`, `MessageType` in `session/socket/`:
- Client → server: `CONNECT`, `UPDATE`, `START_COUNTDOWN`, `JOIN_SERVER`, `LEAVE_SERVER`,
  `CLEAR_STATUS`, `KEEP_ALIVE`, `KICK_PLAYER`, `PROMOTE_PLAYER`, `DEMOTE_PLAYER`, `SET_VISIBILITY`,
  `RENAME_SESSION`.
- Server → client: `UPDATE`, `RUN_COUNTDOWN`, `OUTDATED_CLIENT`, `SESSION_NOT_FOUND`,
  `CONNECTION_REFUSED`.

**Authorization is enforced in-app, not by Keycloak.** Kick/promote/demote/visibility/rename resolve
the requester from *their own socket id* and require `requester.isMaster()` plus same-fleet
membership — the client is never trusted to assert who it is.

**`SessionManager`** (`session/SessionManager.java`) is `@ApplicationScoped @Lock`, the single source
of truth. State is two `ConcurrentHashMap`s: `sessions` (id → `Fleet`) and `sotServers` (hash →
shared `SotServer`). `broadcastDataToSession(id, type, data)` serializes one JSON `SocketMessage` and
sends it to every player's socket, skipping null/closed sockets so one dead socket can't abort the
loop (#436).

> **Concurrency rule — read before editing `SessionManager`.** Reads are `@Lock(READ)`, mutations
> `@Lock(WRITE)`, and I/O helpers `@Lock(NONE)`. **No blocking I/O may run while holding a WRITE
> lock, and nothing blocking may run on the vert.x event loop.** Geolocation is pushed off-thread
> (`GeoLocationResolver`) and re-applied under WRITE via `applyServerGeo`. Violating this has caused
> real incidents (players kicked at countdown end). See [gotchas.md](gotchas.md).

## Public sessions — REST + SSE

`session/SessionDirectoryEndpoints.java`, base path `/public-sessions`:
- `GET /public-sessions` → one-shot `PublicSessionsSnapshot` (JSON).
- `GET /public-sessions/stream` → `text/event-stream` SSE, a `Multi<PublicSessionsSnapshot>` that
  emits an initial snapshot then a new one on every structural change.

The stream is driven by a Mutiny `BroadcastProcessor<Boolean> directoryChanges`; mutating methods
call `publishDirectoryChange()`. **`streamPublicSessions()` must keep `.onOverflow().dropPreviousItems()`** —
without it a slow subscriber is terminated with a `BackPressureFailure` and their list silently
freezes ([gotchas.md](gotchas.md)). The desktop app uses SSE in prod and falls back to polling
`/public-sessions` in dev (mixed-content — see [gotchas.md](gotchas.md)).

## REST endpoints

Auth model: Keycloak OIDC bearer via `@Authenticated`. **Only `POST /report/send` and
`GET /socket/register` are authenticated; every other endpoint is public.** No `@RolesAllowed`.

| Path | Verb | Class | Purpose |
|---|---|---|---|
| `/` | GET | `PublicEndpoints` | health → "Pong!" |
| `/servers/ip` | GET | `SessionManager` | dump the `sotServers` cache |
| `/public-sessions` | GET | `SessionDirectoryEndpoints` | sessions snapshot |
| `/public-sessions/stream` | GET (SSE) | `SessionDirectoryEndpoints` | live snapshot stream |
| `/report/list/all` | GET | `ReportEndpoints` | all reports |
| `/report/list/{page}/{amount}` | GET | `ReportEndpoints` | paged reports |
| `/report/send` | POST | `ReportEndpoints` | persist a report — **`@Authenticated`** |
| `/github/release/download` | GET | `GithubRest` | latest Windows installer URL |
| `/stats/online-users` | GET | `StatsEndpoints` | live user count |
| `/stats/all` | GET | `StatsEndpoints` | summed daily counters |
| `/stats/download` | POST | `StatsEndpoints` | bump today's download counter |
| `/stats/alliance` | GET | `AllianceStatsEndpoints` | alliance analytics (`?ownerRegion=&serverRegion=`) |
| `/stats/regions` | GET | `AllianceStatsEndpoints` | owner-region attempt counts |
| `/socket/register` | GET | `SocketSecurityEndpoints` | issue one-time WS token — **`@Authenticated`** |

`/stats` is served by **two** resource classes (`StatsEndpoints` + `AllianceStatsEndpoints`) sharing
the root with disjoint sub-paths — easy to miss when searching.

## Persistence

Hibernate ORM + Panache. `quarkus.hibernate-orm.database.generation=update` (schema auto-managed).

| Entity | Table | Shape |
|---|---|---|
| `reports/ReportEntity` | `reporting` | `id`, `date`, `message`, `logs`, `device` (active-record) |
| `statistics/StatisticsEntity` | `statistics` | `@Id date` (one row **per day**), `download`, `session_open`, `session_try` — upserted via `StatisticsRepository` |
| `statistics/AllianceAttempt` | `alliance_attempt` | `ts_utc`, `owner_region`, `server_region`, `players`, `distinct_servers`, `largest_group`, `converged`, `try_number` — **carries no identifiers** |

`FleetStats` is an in-memory POJO (not persisted). Datasource: prod/dev = PostgreSQL, `%test` = H2
in-memory. Prod DB credentials come from `${DB_USER}` / `${DB_PASSWORD}` env vars (with dev-default
fallbacks already in the file — don't add new secrets there). OIDC verifies JWTs locally against JWKS
(introspection disabled, #649).

## Statistics — two systems

1. **Daily counters** (`StatisticsEntity`, one row/day): incremented on session create
   (`incrementSession`), on `START_COUNTDOWN` (`incrementTry`), and `POST /stats/download`. Served by
   `/stats/all` and `/stats/online-users`. Writes run on a background executor.
2. **Anonymous alliance analytics** (`AllianceAttempt`, issue #673): on `START_COUNTDOWN`,
   `recordAllianceAttempt(sessionId)` is scheduled ~30s later (after detection settles). It skips if
   any master opted out (`Player.shareStats`, opt-out defaulting to true) or nobody landed on a
   detected server, then persists a record built by the **pure, unit-tested** `buildAttempt(fleet,
   now)` — convergence (`distinctServers == 1`), player counts, owner region (#672), server region.
   `AllianceStatsEndpoints` aggregates rows in-memory into the dashboard's heatmap / rate / best-hours
   (gated by `MIN_SAMPLE = 30`) and the globe's region counts.

## Tests

`backend/src/test/java/fr/zelytra/...` mirrors the main layout. All `@QuarkusTest` (JUnit 5) on the
`%test` **H2 in-memory** profile — no DB or containers. Run `./mvnw test`. Notable:
- `session/SessionSocketTest` — drives the real WS via `@TestHTTPResource`, helper
  `client/BetterFleetClient`, `@InjectMock ProxyCheckAPI` (geo offline).
- `session/SessionManagerTest` — `OidcWiremockTestResource` mocks Keycloak for `@Authenticated` paths.
- `session/AllianceAttemptBuilderTest` — unit-tests the pure `buildAttempt` / opt-out logic (the
  scheduled recorder is delayed to 3600s in `%test` so it never fires mid-run).
- Plus encoder/decoder, geo parsing, fleet/server, statistics, reports, github, security tests.
