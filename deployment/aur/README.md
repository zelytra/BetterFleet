# AUR packaging

`betterfleet-bin/PKGBUILD` is the prebuilt Arch package for BetterFleet: it repackages the `.deb`
produced by the release workflow (issue #728) so Arch/CachyOS users install with:

```
paru -S betterfleet-bin   # or: yay -S betterfleet-bin
```

`pacman -S` on its own can't reach the AUR: that's expected; the AUR is what third-party Arch
software uses. A self-hosted signed pacman repo (for a literal `pacman -S betterfleet`) is an
optional future add-on, tracked in #740.

## Status

The same repackaging is validated on every release: the release CI builds the pacman package from
the `.deb` and attaches `betterfleet-bin-<ver>-x86_64.pkg.tar.zst` to the GitHub release
(`publish-arch`), installable directly with `sudo pacman -U <url>`. Publishing to the **AUR** is the
one-time setup below.

## Publishing to the AUR (automated, one-time setup)

The `publish-aur` job in `.github/workflows/release.yml` does the whole flow on every **stable**
release (never a pre-release: an RC must not land on the public `betterfleet-bin`). It downloads the
release `.deb`, pins `pkgver` and `sha256sums`, renders `.SRCINFO` with `makepkg --printsrcinfo`, and
pushes `PKGBUILD` + `.SRCINFO` + `betterfleet-bin.install` over SSH. It is **guarded**: the whole job
skips (with a warning, never failing the release) until the SSH key below is set.

### Secret this needs (not yet configured)

| Secret | What |
|---|---|
| `AUR_SSH_PRIVATE_KEY` | Private half of an SSH key registered on an AUR account that maintains `betterfleet-bin` |

### One-time setup

1. Create / sign in to an [AUR account](https://aur.archlinux.org) and add an SSH **public** key to
   it (My Account -> SSH Public Key).
2. Put the matching **private** key in a repo secret named `AUR_SSH_PRIVATE_KEY`
   (Settings -> Secrets and variables -> Actions).
3. Cut a stable release. `publish-aur` clones `ssh://aur@aur.archlinux.org/betterfleet-bin.git` (an
   empty repo the first time), commits the rendered package and pushes: the first push creates the
   AUR package, later releases update it.

Until the secret is set, the job no-ops on every release and nothing else is affected.

## Privilege

Packet capture needs a capability, granted to a **separate helper** (issue #726), not the GUI, so
this package keeps the GUI unprivileged. `betterfleet-bin.install` runs the helper's `setcap` in
`post_install` / `post_upgrade`.
