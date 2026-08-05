// Dev setup for the Linux packet-capture helper (#726), run before `tauri dev` by the tauri:dev
// npm script.
//
// `tauri dev` runs `cargo run` on the GUI alone, so it never builds the betterfleet-netcap helper,
// and the CAP_NET_RAW capability does not survive a relink anyway. This script builds the helper and
// grants it the capability every dev start, so server detection works with no manual step. Only the
// helper is capped; the GUI stays unprivileged, exactly like the packaged app. It is a no-op on
// Windows and macOS, where there is no helper and no capability model.
import { execFileSync, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "linux") {
  process.exit(0);
}

const webappDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcTauri = join(webappDir, "src-tauri");
const helper = join(srcTauri, "target", "debug", "betterfleet-netcap");

// 1. Build the helper (debug). It lands in target/debug next to the GUI binary, which is where the
//    app looks for it at runtime.
try {
  execSync("cargo build -p better_fleet_netcap", {
    cwd: srcTauri,
    stdio: "inherit",
  });
} catch {
  console.warn(
    "[netcap] helper build failed; detection will fall back to in-process capture.",
  );
  process.exit(0);
}

if (!existsSync(helper)) {
  console.warn(`[netcap] ${helper} not found after build; skipping setcap.`);
  process.exit(0);
}

// 2. Grant CAP_NET_RAW to the helper only. This needs root, so it uses sudo; add a NOPASSWD sudoers
//    rule for this one command to skip the prompt (see the Developer wiki). A failure is non-fatal:
//    the app falls back to the in-process capture, so `tauri dev` still starts.
try {
  execFileSync("sudo", ["setcap", "cap_net_raw+ep", helper], {
    stdio: "inherit",
  });
  console.log(`[netcap] granted cap_net_raw+ep to ${helper}`);
} catch (error) {
  console.warn(
    `[netcap] could not setcap the helper: ${error.message}\n` +
      `[netcap] Detection will fall back to in-process capture. Grant it manually with:\n` +
      `[netcap]   sudo setcap cap_net_raw+ep ${helper}`,
  );
}
