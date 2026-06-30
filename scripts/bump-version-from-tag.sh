#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tag="${1:-${GITHUB_REF_NAME:-}}"

if [[ -z "${tag}" ]]; then
  echo "usage: $0 <tag-or-version>" >&2
  echo "example: $0 v2.0.0" >&2
  exit 1
fi

node "${repo_root}/.github/scripts/set-version-from-tag.mjs" "${tag}"
