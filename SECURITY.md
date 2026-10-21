# Security policy

BetterFleet is a free, open-source project maintained by volunteers. We take security reports
seriously, and we are grateful to anyone who takes the time to send one.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public issues, pull requests, or Discord.**

Report them privately through GitHub instead:
**[Report a vulnerability](https://github.com/zelytra/BetterFleet/security/advisories/new)**
(the *Security* tab of this repository, then *Report a vulnerability*). The report stays visible
only to you and the maintainers until a fix is published.

A useful report includes:

- the component affected (see the scope below) and the version (app header, or the release tag);
- the kind of issue (privilege escalation, authentication bypass, data exposure, ...);
- step-by-step instructions to reproduce it, and a proof of concept if you have one;
- the impact as you understand it: what an attacker gains, and what they need first;
- any suggested fix or mitigation.

## What happens next

We are a small team working on BetterFleet in our free time, so these are goals, not guarantees:

- we acknowledge the report within **7 days**;
- we confirm (or explain why we do not consider it a vulnerability) and share a first assessment
  within **14 days**;
- we keep you updated in the advisory thread while we work on a fix, and agree a disclosure date
  with you.

Once a fix is released, we publish a GitHub Security Advisory (requesting a CVE when it applies)
and credit you, unless you prefer to stay anonymous.

## Supported versions

Only the **latest stable release** receives security fixes. The backend refuses clients it no
longer supports, so the fix is always shipped as a new release that every player is prompted to
install.

| Version | Supported |
|---|---|
| Latest stable release ([releases](https://github.com/zelytra/BetterFleet/releases/latest)) | ✅ |
| Older releases, pre-releases (`-rc.N`) | ❌ |

Self-hosted deployments should track the latest release as well.

## Scope

In scope: everything in this repository, and the official deployment it builds. Areas where a
report is especially valuable:

- **Privileged components of the desktop app**: the Windows capture service
  (`BetterFleetCapture`) and its named pipe, the Linux capture helper (`betterfleet-netcap`, which
  holds `CAP_NET_RAW`), and the installer / package scripts that set them up. Anything that lets an
  unprivileged user or process gain privileges or capture traffic beyond the game's.
- **The update path**: anything that could make a client install an update that was not signed by
  the project.
- **Authentication and sessions**: the sign-in flow (loopback OAuth with PKCE), token handling and
  storage, and the WebSocket session protocol (for example acting as a session master without being
  one, or joining a private session without its code).
- **The backend API**: access to data or actions an endpoint should not allow, injection, server-side
  request forgery.
- **Personal data**: exposure of player data, diagnostic reports or logs to anyone but the
  maintainers.

Out of scope:

- *Sea of Thieves* itself, its servers and its anti-cheat: report those to Rare / Microsoft.
- Vulnerabilities in third-party software we use (Keycloak, Tauri, Quarkus, WebView2, ...) unless
  BetterFleet's configuration or usage makes them exploitable: report the rest upstream.
- Denial of service through traffic volume, and automated scanner output without a demonstrated
  impact.
- Attacks that require physical access to the machine, or an attacker who is already an
  administrator / root on it.
- Social engineering of maintainers or players.

## Safe harbor

We will not take action against research done in good faith that follows this policy: test against
your own accounts, sessions and self-hosted instances, do not access or modify other players' data,
do not degrade the service for others, and give us reasonable time to fix the issue before
disclosing it.
