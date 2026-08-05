# AUR packaging

`betterfleet-bin/PKGBUILD` is the prebuilt Arch package for BetterFleet — it repackages the `.deb`
produced by the release workflow (issue #728) so Arch/CachyOS users install with:

```
paru -S betterfleet-bin   # or: yay -S betterfleet-bin
```

`pacman -S` on its own can't reach the AUR — that's expected; the AUR is what third-party Arch
software uses. A self-hosted signed pacman repo (for a literal `pacman -S betterfleet`) is an
optional future add-on, tracked in #740.

## Status

This PKGBUILD is a **template**. It can only build once a Linux release has been published (its
`source` points at a release asset), so it has not been build-tested yet.

## Publishing (once a Linux release exists)

1. Set `pkgver` to the release tag and pin `sha256sums` to the real hash of the release `.deb`.
2. `makepkg --printsrcinfo > .SRCINFO`
3. Push `PKGBUILD` + `.SRCINFO` to the `betterfleet-bin` AUR git repo.

Ideally the release CI (#728) automates steps 1–3 so the AUR never drifts from the published build.

## Privilege

Packet capture needs a capability, granted to a **separate helper** (issue #726), not the GUI — so
this package keeps the GUI unprivileged. The helper's `setcap` belongs in a `.install`
`post_install`, added when #726 lands.
