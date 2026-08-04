#!/usr/bin/env bash
# Add one BetterFleet .deb to the reprepro repository rooted at REPO_DIR, pruning any pool blob
# that falls out of the index in the process (reprepro's includedeb keeps only the newest version
# of a package in the index; deleteunreferenced then drops the now-orphaned older .deb from disk).
#
# Used by .github/workflows/release.yml's publish-apt job, and safe to run by hand — e.g. to test
# against a local output directory, or to self-host this repo somewhere other than GitHub Pages:
#
#   deployment/apt/publish.sh path/to/BetterFleet_2.3.0_amd64.deb ./deployment/apt/public
#
# Requires: reprepro, and a gpg keyring containing exactly one secret key (conf/distributions uses
# `SignWith: yes`, i.e. "sign with whatever the default secret key is"). See ../README.md for how
# CI provisions that keyring from the APT_GPG_PRIVATE_KEY / APT_GPG_PASSPHRASE secrets.
set -euo pipefail

DEB_PATH="${1:?Usage: publish.sh <path-to-deb> [repo-dir]}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${2:-${SCRIPT_DIR}/public}"
CODENAME="${APT_CODENAME:-stable}"

if [ ! -f "${DEB_PATH}" ]; then
  echo "publish.sh: no such file: ${DEB_PATH}" >&2
  exit 1
fi

mkdir -p "${REPO_DIR}/conf"
cp "${SCRIPT_DIR}/conf/distributions" "${REPO_DIR}/conf/distributions"

reprepro --basedir "${REPO_DIR}" includedeb "${CODENAME}" "${DEB_PATH}"
reprepro --basedir "${REPO_DIR}" deleteunreferenced

# The public half of the signing key, for end users to add before trusting the repo (README §
# "Installing"). Re-exported every run — cheap, and keeps it in sync if the key is ever rotated.
gpg --armor --export > "${REPO_DIR}/betterfleet-archive-keyring.asc"

# This directory is served as static files (GitHub Pages or otherwise) — never run it through Jekyll.
touch "${REPO_DIR}/.nojekyll"

echo "APT repo at ${REPO_DIR} updated (codename: ${CODENAME}, package: ${DEB_PATH##*/})"
