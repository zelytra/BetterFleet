# Arch / pacman packaging

The pacman package is attached to **every GitHub release** as
`betterfleet-bin-<ver>-x86_64.pkg.tar.zst`. On Arch/CachyOS/derivatives, download that file from the
[release](https://github.com/zelytra/BetterFleet/releases) and install it locally:

```
sudo pacman -U betterfleet-bin-<ver>-x86_64.pkg.tar.zst
```

To update, download the newer `.pkg.tar.zst` and `pacman -U` it again: Linux has no auto-updater.
This local install is the real, supported Arch path. The `publish-arch` job in
`.github/workflows/release.yml` builds the package from the release `.deb` (`betterfleet-bin/PKGBUILD`
repackages it, issue #728) and uploads it on every release, RC included (an RC package harms no one:
it is served from no repo, so nothing installs it by surprise).

## `betterfleet-bin.install` is live: do not delete it

`betterfleet-bin/betterfleet-bin.install` is **not dead code.** `publish-arch` copies it into the
build and the generated `PKGBUILD` sets `install='betterfleet-bin.install'`, so it runs the helper's
`setcap` in `post_install` / `post_upgrade` (see Privilege below). Removing it silently breaks server
detection on the pacman install.

## AUR: not pursued (dormant plumbing)

Publishing to the [AUR](https://aur.archlinux.org), which is what would let `paru -S betterfleet-bin`
or `yay -S betterfleet-bin` work, is **not pursued**: AUR account registrations are closed. Plain
`pacman -S` never reaches the AUR regardless; the supported route is the `pacman -U` download above.

The `publish-aur` job is kept **dormant** in case that ever changes. It is guarded on an
`AUR_SSH_PRIVATE_KEY` secret that is intentionally unset, so it no-ops on every release and affects
nothing else. If the AUR route is ever revived, the job (on stable releases only) downloads the
release `.deb`, pins `pkgver` and `sha256sums`, renders `.SRCINFO` with `makepkg --printsrcinfo`, and
pushes `PKGBUILD` + `.SRCINFO` + `betterfleet-bin.install` over SSH to
`ssh://aur@aur.archlinux.org/betterfleet-bin.git` once that private key is provided.

## Privilege

Packet capture needs a capability, granted to a **separate helper** (issue #726), not the GUI, so
this package keeps the GUI unprivileged. `betterfleet-bin.install` runs the helper's `setcap` in
`post_install` / `post_upgrade`.
