# APT repository

> **BetterFleet does not publish an APT repository.** There is no `apt install betterfleet`, and the
> `https://zelytra.github.io/BetterFleet/apt` repo referenced below does not exist. On
> Debian/Ubuntu/derivatives, download the `.deb` from the
> [GitHub release](https://github.com/zelytra/BetterFleet/releases) and install it with
> `sudo apt install ./BetterFleet_<ver>_amd64.deb` (or `sudo dpkg -i`). To update, download the newer
> `.deb` and reinstall: Linux has no auto-updater.

Everything in this directory is **dormant on purpose.** A hosted APT repo was judged not worth the
upkeep, so the `publish-apt` job runs but never publishes (it is guarded, see below) and nothing here
is a live install path. The plumbing (reprepro config, `publish.sh`, the guarded CI job) is preserved
only in case that decision is revisited; the notes below document that dormant setup, not a user
install path. Sibling to `deployment/aur/` (the Arch side of #740): both repackage the same release
artifact, the `.deb` built by the Linux leg of `publish-tauri` in `.github/workflows/release.yml`.

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
├── conf/distributions   # reprepro config: the source of truth, hand-edited
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

## Privilege

Same model as the AUR package (see `deployment/aur/README.md`): packet capture needs a capability
granted to a separate helper (#726), not the GUI. Nothing about repackaging the `.deb` here changes
that: the postinst behavior is whatever ships inside the `.deb` itself.

## Non-goals (here)

- COPR (Fedora): a hosted COPR repo was not attempted. The `.rpm` itself ships from every GitHub
  release now (the Linux bundle targets `deb` + `rpm`); only a repo to `dnf install` it from is out
  of scope here.
- arm64: the release only builds `amd64`; nothing to publish for other architectures yet.
- Wiring the website download screen to an APT install command (#730): moot while the repo stays
  dormant, and out of scope here regardless.
