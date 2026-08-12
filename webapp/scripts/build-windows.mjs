// Windows-only build, runnable from Linux, run by the tauri:build:windows npm script.
//
// On a Windows host this is just `tauri build`. Everywhere else it cross-compiles the Windows
// executable with cargo-xwin (Tauri's supported Linux -> Windows route: real MSVC target, the
// Windows CRT + SDK are downloaded once into ~/.cache/cargo-xwin). The build is `--no-bundle` on
// purpose: the NSIS installer needs makensis plus the updater signing key, both CI-only concerns —
// for a VM or smoke test the raw exe is the artifact you want, and it embeds the frontend, so the
// single file is enough. The requireAdministrator manifest is compiled in via llvm-rc, so the exe
// prompts UAC exactly like the released one.
//
// One-time setup on Linux (checked below, with the exact commands echoed when missing):
//   rustup target add x86_64-pc-windows-msvc
//   cargo install --locked cargo-xwin
// llvm-rc / clang-cl / lld-link must be on PATH (package `llvm` on Arch, `llvm lld` on Debian).
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const TARGET = "x86_64-pc-windows-msvc";
const webappDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function run(cmd, args, options = {}) {
  execFileSync(cmd, args, { cwd: webappDir, stdio: "inherit", ...options });
}

if (process.platform === "win32") {
  run("npx", ["tauri", "build"], { shell: true });
  process.exit(0);
}

// `cargo install` drops cargo-xwin in ~/.cargo/bin, which non-login shells (and npm) often don't
// have on PATH; prepend it so the runner resolves either way.
const env = {
  ...process.env,
  PATH: `${join(homedir(), ".cargo", "bin")}${delimiter}${process.env.PATH}`,
};

try {
  execFileSync("cargo-xwin", ["--version"], { env, stdio: "ignore" });
} catch {
  console.error(
    "[build-windows] cargo-xwin not found. One-time setup:\n" +
      "[build-windows]   rustup target add x86_64-pc-windows-msvc\n" +
      "[build-windows]   cargo install --locked cargo-xwin",
  );
  process.exit(1);
}

const targets = execFileSync("rustup", ["target", "list", "--installed"], {
  env,
}).toString();
if (!targets.includes(TARGET)) {
  console.error(
    `[build-windows] Rust target ${TARGET} not installed. Run:\n` +
      `[build-windows]   rustup target add ${TARGET}`,
  );
  process.exit(1);
}

run(
  "npx",
  [
    "tauri",
    "build",
    "--runner",
    "cargo-xwin",
    "--target",
    TARGET,
    "--no-bundle",
  ],
  { env },
);

const exe = join("src-tauri", "target", TARGET, "release", "BetterFleet.exe");
if (existsSync(join(webappDir, exe))) {
  console.log(`[build-windows] Windows executable: webapp/${exe}`);
}
