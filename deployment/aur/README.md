# Arch / pacman packaging

The pacman package is attached to **every GitHub release** as
`betterfleet-bin-<ver>-x86_64.pkg.tar.zst`. On Arch/CachyOS/derivatives, download that file from the
[release](https://github.com/zelytra/BetterFleet/releases) and install it locally:

```
sudo pacman -U betterfleet-bin-<ver>-x86_64.pkg.tar.zst
```

To update, download the newer `.pkg.tar.zst` and `pacman -U` it again: Linux has no auto-updater.
This local install is the real, supported Arch path. The `publish-arch` job in
`.github/workflows/release.yml` builds the package from the release `.deb` with an inline PKGBUILD
(issue #728) and uploads it on every release, RC included (an RC package harms no one: it is served
from no repo, so nothing installs it by surprise). `betterfleet-bin/PKGBUILD` is the same recipe
kept as a standalone reference, sourcing the `.deb` from the release URL, for building the package
by hand with `makepkg`.

## `betterfleet-bin.install` is live: do not delete it

`betterfleet-bin/betterfleet-bin.install` is **not dead code.** `publish-arch` copies it into the
build and the generated `PKGBUILD` sets `install='betterfleet-bin.install'`, so it runs the helper's
`setcap` in `post_install` / `post_upgrade` (see Privilege below). Removing it silently breaks server
detection on the pacman install.

## Hosted repositories: abandoned

BetterFleet publishes **no package repository** — no [AUR](https://aur.archlinux.org) package (so no
`paru -S`/`yay -S betterfleet-bin`), and no APT repo either. AUR account registrations are closed
(shut down after the attacks on the AUR), and hosting our own repos was judged not worth the upkeep
for what it buys. The decision is deliberate; the release assets above are the install path on every
distribution, and the `publish-apt`/`publish-aur` CI jobs that once existed for this were removed
rather than left dormant (they live in git history if that call is ever revisited).

## Privilege

Packet capture needs a capability, granted to a **separate helper** (issue #726), not the GUI, so
this package keeps the GUI unprivileged. `betterfleet-bin.install` runs the helper's `setcap` in
`post_install` / `post_upgrade`.
