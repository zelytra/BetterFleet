# APT repository

A signed APT repo for BetterFleet, so Debian/Ubuntu/derivatives users get:

```
sudo apt install betterfleet
```

instead of a manual `.deb` download. Sibling to `deployment/aur/` (the Arch side of #740): see that
directory's README for the AUR package. Both repackage the same release artifact: the `.deb` built
by the Linux leg of `publish-tauri` in `.github/workflows/release.yml` (#727/#739 bundle it,
#728/#737 publish it).

## Approach

A flat repo built with **[reprepro](https://salsa.debian.org/brlink/reprepro)** and published as
static files on **GitHub Pages**, served from the `gh-pages` branch under `/apt/`. reprepro was
picked over aptly for this: one config file (`conf/distributions`), no daemon/state beyond the repo
directory itself, and `includedeb` + `deleteunreferenced` is exactly the "add the new version, drop
the old blob" operation a release needs. GitHub Pages was picked over attaching a repo tree to each
release because APT needs one stable URL to poll: release assets are per-tag and don't give you
that.

One distro-agnostic suite (`stable`, `amd64` only): the app has no per-Debian/Ubuntu-release
dependency, so there's no need to mirror upstream's per-codename structure.

## Repo structure

```
deployment/apt/
├── conf/distributions   # reprepro config — the source of truth, hand-edited
├── publish.sh            # includedeb + prune + re-export the pubkey; used by CI and by hand
└── README.md              # this file
```

The *published* repo (reprepro's `db/`, `dists/`, `pool/`, plus the exported public key) is
generated output: it lives only on the `gh-pages` branch, never in `master`/feature branches, and
is never hand-edited there. `publish.sh` regenerates `conf/distributions` on that branch from this
directory on every run, so this file is always the one to edit.

## CI mechanism

`.github/workflows/release.yml` has a `publish-apt` job that runs alongside the existing
`publish-backend` / `publish-website` jobs on a real release (tag push, or `workflow_dispatch` with
`dry_run: false`). It:

1. Waits on `publish-tauri` (needs the Linux leg's `.deb` release asset to exist first).
2. Downloads it: `gh release download <tag> --pattern 'BetterFleet_*_amd64.deb'`.
3. Imports the signing key into a scratch GPG keyring.
4. Checks out `gh-pages` (creating it on the first ever run) and runs `publish.sh` against
   `<worktree>/apt`.
5. Commits and pushes `gh-pages` if the repo actually changed.

**Guarded, on purpose**: the whole job is `continue-on-error: true` and every real step is skipped
if `APT_GPG_PRIVATE_KEY` isn't set (a warning is logged instead). Nothing here is in
`sync-version-to-master`'s `needs`, so this job cannot hold up or fail the Windows/Linux/backend/
website publish steps: either because the secret isn't configured yet, or because of an
unexpected failure once it is.

## Secrets this needs (not yet configured; nothing is invented/guessed here)

| Secret | Required | What |
|---|---|---|
| `APT_GPG_PRIVATE_KEY` | Yes, to turn this on | ASCII-armored private key the repo's `Release` file is signed with |
| `APT_GPG_PASSPHRASE` | Only if the key has one | Passphrase for the key above |

Until `APT_GPG_PRIVATE_KEY` is set, `publish-apt` runs and no-ops on every release: the AUR package
and Windows/Linux downloads are unaffected either way.

### Generate the key

A dedicated key used for nothing else, so a passphrase-less one is fine (simplifies unattended CI
signing; the blast radius of the secret leaking is "someone can publish fake packages to this one
repo", not an account takeover):

```bash
gpg --batch --full-generate-key <<'EOF'
%no-protection
Key-Type: RSA
Key-Length: 4096
Name-Real: BetterFleet APT Repository
Name-Email: alexbreuillet@gmail.com
Expire-Date: 2y
%commit
EOF

gpg --export-secret-keys --armor "BetterFleet APT Repository" > apt-private.asc
```

Paste `apt-private.asc`'s contents into a repo secret named `APT_GPG_PRIVATE_KEY`
(Settings → Secrets and variables → Actions), then delete the local file. If you gave the key a
passphrase instead of `%no-protection`, also add `APT_GPG_PASSPHRASE`.

The key expires in 2 years (`Expire-Date: 2y`); past that, signing fails until it's rotated
(regenerate, update the secret, and the next release re-publishes the new publish key automatically).

### Enable GitHub Pages (one-time, and only after the secret is set)

The `gh-pages` branch doesn't exist until the first successful `publish-apt` run creates it, and
GitHub's branch picker only lists branches that already exist, so in order:

1. Add `APT_GPG_PRIVATE_KEY` (and `APT_GPG_PASSPHRASE` if applicable) as above.
2. Cut the next release. `publish-apt` creates and pushes `gh-pages`.
3. Settings → Pages → Source: "Deploy from a branch" → Branch: `gh-pages`, folder `/ (root)`.

After that, every future release just pushes to `gh-pages` and Pages redeploys on its own: no
further manual steps.

## Installing (end users)

```bash
# 1. Trust the signing key
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://zelytra.github.io/BetterFleet/apt/betterfleet-archive-keyring.asc \
  | sudo gpg --dearmor -o /etc/apt/keyrings/betterfleet.gpg

# 2. Add the repo
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/betterfleet.gpg] https://zelytra.github.io/BetterFleet/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/betterfleet.list

# 3. Install
sudo apt update
sudo apt install betterfleet
```

`apt upgrade` picks up new releases from then on: no reinstalling the key or repo entry.

## Status

Not live yet. This is the plumbing (config, script, guarded CI job); the two manual, one-time steps
above (secret + Pages) still need the maintainer to run them before `sudo apt install betterfleet`
actually works. Until then `publish-apt` runs harmlessly as a no-op on every release.

## Privilege

Same model as the AUR package (see `deployment/aur/README.md`): packet capture needs a capability
granted to a separate helper (#726), not the GUI. Nothing about repackaging the `.deb` here changes
that: the postinst behavior is whatever ships inside the `.deb` itself.

## Non-goals (here)

- `.rpm` / COPR (Fedora): optional item on #740, not attempted.
- arm64: the release only builds `amd64`; nothing to publish for other architectures yet.
- Wiring the website download screen to show this command (#730), out of scope for this change.
