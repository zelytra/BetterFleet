#!/bin/sh
# Grant the packet-capture helper the CAP_NET_RAW capability it needs to open its AF_PACKET socket,
# so server detection works while the GUI itself stays unprivileged (#726). Best-effort: if setcap
# is unavailable or the filesystem refuses the capability, detection degrades to "no server" rather
# than failing the install. libcap2-bin (which provides setcap) is a package dependency.
set -e

if command -v setcap >/dev/null 2>&1; then
    setcap cap_net_raw+ep /usr/bin/betterfleet-netcap || true
fi

exit 0
