# Architecture

How the three apps fit together and how data moves between them.

## The problem it solves

*Sea of Thieves* has no way to guarantee a crew lands on the same server. BetterFleet reads the
game's live server (from the machine, natively), shares each player's server + ready state across the
alliance in real time, and fires a **synchronized countdown** so everyone hits "set sail" at the same
instant — maximizing the chance the matchmaker puts them together.

## The three apps

```
┌─────────────────────────┐        WebSocket  /sessions/{token}/{sessionId}
│  webapp/  (desktop app)  │◀──────────── real-time session state ───────────┐
│                          │                                                 │
│  Tauri v1 (Rust shell)   │        REST  /public-sessions, /stats, /report  │
│   • game detection       │◀──────────── + SSE /public-sessions/stream ─────┤
│   • global hotkey        │                                                 │
│   • overlay window       │                                          ┌──────▼───────┐
│   • native audio         │                                          │  backend/    │
│  Vue 3 + TS (UI)         │        OIDC bearer token                 │  (Quarkus)   │
└───────────┬──────────────┘◀──── Keycloak ────▶┌─────────────┐       └──────┬───────┘
            │                                    │  Keycloak   │              │
            │                                    └─────────────┘         PostgreSQL
            │  reads the running game
            ▼
     Sea of Thieves process (server IP:port)

┌─────────────────────────┐        REST  /stats/alliance, /stats/regions
│  website/  (vitrine)     │◀──────────── public statistics dashboard ───────▶ backend/
│  Vue 3 + TS              │
└─────────────────────────┘
```

- **`webapp/`** — the Windows desktop app. A **Tauri v1** Rust shell does the OS-level work (detect
  the game's server, register a global hotkey, own a borderless overlay window, play the countdown
  jingle natively) and wraps a **Vue 3 + TypeScript** UI. See [frontend.md](frontend.md).
- **`backend/`** — a **Quarkus** (Java 17) service. Sessions run over **WebSocket**; REST serves the
  public sessions browser, anonymous statistics, diagnostic reports, and a GitHub release proxy for
  the self-updater. See [backend.md](backend.md).
- **`website/`** — the **Vue 3** public marketing site and statistics dashboard (reads the backend's
  `/stats/*` endpoints).

## Transport per feature

Knowing which transport a feature uses saves a lot of guessing:

| Feature | Transport | Endpoint |
|---|---|---|
| Alliance session (lobby, ready states, countdown) | **WebSocket** | `/sessions/{token}/{sessionId}` |
| Public sessions browser | **REST poll** in dev, **SSE** in prod | `/public-sessions`, `/public-sessions/stream` |
| Anonymous statistics + globe | REST | `/stats/all`, `/stats/alliance`, `/stats/regions`, `/stats/online-users` |
| Diagnostic / feedback reports | REST | `/report/*` |
| Self-update (installer URL) | REST | `/github/release/download` (backend proxies the Tauri release manifest) |
| Game server detection | none — **native**, in the Rust shell | reads the running game process |

The WebSocket handshake is gated by a one-time token from the authenticated `GET /socket/register`;
see [backend.md](backend.md) for the full CONNECT flow and message protocol.

## Auth

**Keycloak** (realm `Betterfleet`, OIDC public client `application`). The desktop app authenticates
the user, obtains a bearer token, and uses it only where the backend requires it (`/socket/register`
before opening a session socket, `/report/send`). Session authorization — who may kick, promote,
rename — is enforced **inside the WebSocket handler** from the requester's own socket identity, not by
Keycloak roles. The real login is a self-registered Keycloak account; the Microsoft/Xbox IdP in the
realm has never worked (see [gotchas.md](gotchas.md)).

## State ownership

- **Live session state is in-memory in the backend** (`SessionManager`, two `ConcurrentHashMap`s) —
  it is not persisted. A restart drops active sessions.
- **PostgreSQL persists only aggregates**: daily counters (`statistics`), anonymous per-countdown
  analytics (`alliance_attempt`), and diagnostic reports (`reporting`). None of it identifies a
  player.
- **The client persists user preferences locally** (via the Tauri layer) — locale, device, boat
  size, banner, sound, overlay hotkey, Rich Presence opt-in, stats opt-in.

## Where a change usually lands

- New in-session behavior (a new lobby action) → a new `MessageType` + handler in `SessionSocket`,
  plus the client send/receive in `webapp/src/objects/fleet/`.
- New setting → `ConfigComponent.vue` + `Player` model both sides + a locale key. See
  [recipes.md](recipes.md).
- New public/statistics data → a REST resource in `backend/` + a fetch in `website/` and/or `webapp/`.
- New native capability (hotkey, window, audio, detection) → a `#[tauri::command]` in
  `webapp/src-tauri/src/main.rs` + an `invoke(...)` on the client. See [recipes.md](recipes.md).
