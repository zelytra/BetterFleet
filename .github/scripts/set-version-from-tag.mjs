#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SEMVER =
  /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseVersion(input) {
  let raw = (input ?? process.env.GITHUB_REF_NAME ?? "").trim();
  if (raw.startsWith("refs/tags/")) {
    raw = raw.slice("refs/tags/".length);
  }
  const version = raw.replace(/^v/i, "");
  if (!SEMVER.test(version)) {
    console.error(`Invalid semver: "${version}" (input: "${input ?? ""}")`);
    process.exit(1);
  }
  return version;
}

function setPackageJsonVersion(path, version) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (typeof data.version !== "string") {
    throw new Error(`Missing "version" in ${path}`);
  }
  data.version = version;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function setTauriConfVersion(path, version) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (typeof data.version === "string") {
    data.version = version;
  } else if (data.package && typeof data.package.version === "string") {
    data.package.version = version;
  } else {
    throw new Error(`No version field in ${path}`);
  }
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function setCargoPackageVersion(path, version) {
  const content = readFileSync(path, "utf8");
  const updated = content.replace(
    /(\[package\][\s\S]*?^version = )"[^"]+"/m,
    `$1"${version}"`,
  );
  if (updated === content) {
    throw new Error(`Could not update [package].version in ${path}`);
  }
  writeFileSync(path, updated);
}

function setAppVersionList(path, version) {
  const content = readFileSync(path, "utf8");
  const match = content.match(/^app\.version=(.*)$/m);
  if (!match) {
    throw new Error(`app.version not found in ${path}`);
  }

  const versions = match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!versions.includes(version)) {
    versions.push(version);
  }

  const updated = content.replace(
    /^app\.version=.*$/m,
    `app.version=${versions.join(",")}`,
  );
  writeFileSync(path, updated);
}

const version = parseVersion(process.argv[2]);
const targets = [
  ["webapp/package.json", setPackageJsonVersion],
  ["website/package.json", setPackageJsonVersion],
  ["webapp/src-tauri/Cargo.toml", setCargoPackageVersion],
  ["webapp/src-tauri/tauri.conf.json", setTauriConfVersion],
  ["backend/src/main/resources/application.properties", setAppVersionList],
];

for (const [relativePath, updater] of targets) {
  const absolutePath = resolve(repoRoot, relativePath);
  updater(absolutePath, version);
  console.log(`updated ${relativePath}`);
}

console.log(`version set to ${version}`);
