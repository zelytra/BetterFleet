# lobby-shots

The four screenshots on the website's Discover page (`/tutorial`) are captured from here.

They are pictures of the **real lobby**: the app's own components, styles, fonts and translations,
in its shipped 1260×760 window. Only the session behind them is fabricated: reaching "three players
converged on one server, a fourth elsewhere" for real takes four accounts, a running backend and
some luck, and it cannot be re-staged the next time the lobby changes.

```
npm run shots          # from webapp/ — rewrites website/src/assets/steps/*.webp
```

That boots a Vite server on this folder, drives a headless Chromium over CDP, and writes
`{session,ready,countdown,grouped}-{fr,en}.webp`. It needs Chrome or Edge installed; set `CHROME` if
it lives somewhere unusual.

To look at a moment in a real browser instead:

```
npx vite --config tools/lobby-shots/vite.config.mjs --port 8098
# then open http://localhost:8098/?shot=grouped&lang=fr
```

## What is stubbed, and why

| Stub             | Replaces             | Why                                                                                                                                                                    |
| ---------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `main-stub.ts`   | `@/main.ts`          | The real one boots keycloak and `createApp` at import time.                                                                                                            |
| `router-stub.ts` | `@/router`           | The real one pulls in the keycloak store and the authed shell.                                                                                                         |
| `AppShell.vue`   | `FleetMenuNavigator` | The real one polls Tauri for the game state every 400ms and leaves the session on unmount. Its markup and layout are copied verbatim, so the app's own header renders. |

`entry.ts` builds the `Fleet` and the `UserStore.player` each moment needs, and pins the avatar
colours (the app picks them with `Math.random()` per render, which would give every shot a different
palette).

## When to retake them

Whenever the lobby's layout or wording changes enough that the pictures stop matching the app: a
renamed control, a new element in the banner or the side panel, a restyle. The page's own text lives
in `website/src/assets/locales/*.json` under `tutorial.*` and is not affected.

Sizes are set in `capture.mjs`: the app's default window, plus 80px for the last shot, whose recap
card would otherwise push the side panel into scrolling.
