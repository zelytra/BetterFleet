// Retakes the website tutorial's screenshots from the real lobby.
//
//   npm run shots            (from webapp/)
//
// Boots the lobby-shots vite server, drives a headless Chromium over CDP, and writes the four
// moments, in the two hand-written locales, into website/src/assets/steps/.
//
// CDP rather than `chrome --screenshot`: Emulation.setDeviceMetricsOverride gives an exact viewport
// (the --window-size flag lands 18x152 off) and a device scale factor, and Page.captureScreenshot
// returns exactly that, in webp.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

const HERE = here(".");
const OUT = here("../../../website/src/assets/steps/");
const VITE = here("../../node_modules/vite/bin/vite.js");
const PROFILE = here("../../node_modules/.cache/lobby-shots-chrome/");

const VITE_PORT = 8098;
const CDP_PORT = 9333;
/** Retina without the weight: the site shows these 850-1100px wide. */
const SCALE = 1.5;
/** Only the locales written by hand; es/de/it fall back to English rather than ship five sets. */
const LANGS = ["fr", "en"];

// The app's real window: tauri.conf.json ships main at 1260x760, so every shot is the lobby at the
// size it opens on a player's desktop rather than a size chosen to flatter the picture. The last one
// gets 80px more because the "alliance formed" card takes that from the side panel, which then
// scrolls (true of the app), but it reads as a clipped picture rather than as a full window.
const SHOTS = ["session", "ready", "countdown", "grouped"].map((name) => ({
  name,
  w: 1260,
  h: name === "grouped" ? 840 : 760,
}));

function findChrome() {
  const candidates = [
    process.env.CHROME,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error("no Chromium found — set CHROME to its executable");
  }
  return found;
}

async function waitFor(url, what) {
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      return await (await fetch(url)).json();
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`${what} never came up`);
}

mkdirSync(OUT, { recursive: true });

const vite = spawn(
  process.execPath,
  [
    VITE,
    "--config",
    HERE + "vite.config.mjs",
    "--port",
    String(VITE_PORT),
    "--strictPort",
  ],
  { stdio: "ignore" },
);

const chrome = spawn(findChrome(), [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  `--user-data-dir=${PROFILE}`,
  `--remote-debugging-port=${CDP_PORT}`,
  "about:blank",
]);
chrome.stderr.on("data", () => {});

const stop = () => {
  chrome.kill();
  vite.kill();
};
process.on("exit", stop);

const { webSocketDebuggerUrl } = await waitFor(
  `http://127.0.0.1:${CDP_PORT}/json/version`,
  "chrome",
);
const ws = new WebSocket(webSocketDebuggerUrl);
await new Promise((resolve) => (ws.onopen = resolve));

let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  const slot = message.id && pending.get(message.id);
  if (!slot) return;
  pending.delete(message.id);
  if (message.error) {
    slot.reject(new Error(JSON.stringify(message.error)));
  } else {
    slot.resolve(message.result);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", {
  targetId,
  flatten: true,
});
await send("Page.enable", {}, sessionId);

for (const lang of LANGS) {
  for (const shot of SHOTS) {
    await send(
      "Emulation.setDeviceMetricsOverride",
      {
        width: shot.w,
        height: shot.h,
        deviceScaleFactor: SCALE,
        mobile: false,
      },
      sessionId,
    );
    await send(
      "Page.navigate",
      { url: `http://localhost:${VITE_PORT}/?shot=${shot.name}&lang=${lang}` },
      sessionId,
    );
    // Vite compiles on first request and the app's fonts load over the network. A fixed wait is
    // enough, and it is what keeps the countdown (which is genuinely ticking) at a readable value.
    await sleep(shot.name === "countdown" ? 1400 : 2600);
    const { data } = await send(
      "Page.captureScreenshot",
      { format: "webp", quality: 86, captureBeyondViewport: false },
      sessionId,
    );
    writeFileSync(
      `${OUT}${shot.name}-${lang}.webp`,
      Buffer.from(data, "base64"),
    );
    console.log(`${shot.name}-${lang}.webp  ${shot.w}x${shot.h} @${SCALE}x`);
  }
}

ws.close();
stop();
