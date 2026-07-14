# BetterFleet Helm chart

Production-oriented Helm chart that deploys the full **BetterFleet** stack on a
Kubernetes cluster, targeting a single-node **k3s** install with the default
**Traefik** ingress and **local-path** storage.

It mirrors the project's `deployment/docker-compose.yml` topology one-for-one and
replaces `deployment/nginx.conf` with a Kubernetes Ingress.

## Topology

| Component      | Image                              | Kind          | In-cluster Service (`:port`)     | Purpose                                   |
| -------------- | ---------------------------------- | ------------- | -------------------------------- | ----------------------------------------- |
| `backend`      | `zelytra/better-fleet-backend`     | Deployment    | `<release>-backend:8080`         | Quarkus API + WebSocket sessions          |
| `website`      | `zelytra/better-fleet-website`     | Deployment    | `<release>-website:80`           | Static SPA (nginx)                        |
| `postgres-app` | `postgres:14.2-alpine`             | StatefulSet   | `<release>-postgres-app:5432`    | App database `BetterFleet` (+ PVC)        |
| `postgres-auth`| `postgres:14.2-alpine`             | StatefulSet   | `<release>-postgres-auth:5432`   | Keycloak database `Keycloak` (+ PVC)      |
| `keycloak`     | `quay.io/keycloak/keycloak:24.0`   | Deployment    | `<release>-keycloak:8080`        | Identity provider (`start --import-realm`)|

### Request routing (replaces `nginx.conf`)

All three public routes are served under a single host (`ingress.host`, default
`betterfleet.fr`):

```
https?://<host>/       ->  website  :80
https?://<host>/api    ->  backend  :8080   (the "/api" prefix is STRIPPED)
https?://<host>/auth   ->  keycloak :8080
```

The `/api` prefix strip reproduces nginx's `rewrite ^/api/(.*) /$1`, so the
backend receives paths **without** `/api` (e.g. `/api/servers/ip` ->
`/servers/ip`, and the WebSocket `/api/sessions/{token}/{id}` -> `/sessions/{token}/{id}`).

## Prerequisites

- Kubernetes >= 1.21 (k3s is ideal). Traefik (bundled with k3s) for the default
  ingress path-strip middleware.
- Helm 3.x.
- A default StorageClass (k3s provides `local-path`).

## Quick install on k3s

```bash
# from the repository root
helm install betterfleet ./deployment/helm/betterfleet \
  --namespace betterfleet --create-namespace \
  -f ./deployment/helm/betterfleet/values-k3s.yaml \
  --set secrets.postgresPassword='<strong-pw>' \
  --set secrets.keycloakAdminPassword='<strong-pw>' \
  --set secrets.microsoftClientId='<azure-client-id>' \
  --set secrets.microsoftClientSecret='<azure-client-secret>' \
  --set ingress.host='betterfleet.example.com'
```

Point DNS for the host at your node's IP (or add it to `/etc/hosts` for a local
test), then browse to `http://<host>/`.

Render locally without installing:

```bash
helm template betterfleet ./deployment/helm/betterfleet -f values-k3s.yaml | less
helm lint ./deployment/helm/betterfleet
```

## Secrets

Nothing is hardcoded in templates. Choose one of:

1. **Chart-managed Secret (default).** Set the values under `secrets.*`; the chart
   renders `<release>-betterfleet-secrets`.
2. **Pre-existing Secret.** Set `secrets.existingSecret: my-secret`. All `secrets.*`
   values are then ignored and no Secret is created.

Either way the Secret must expose these keys:

| Key                        | Consumed by (env)                                   |
| -------------------------- | --------------------------------------------------- |
| `POSTGRES_USER`            | both DBs `POSTGRES_USER`; backend `DB_USER`; keycloak `KC_DB_USERNAME` |
| `POSTGRES_PASSWORD`        | both DBs `POSTGRES_PASSWORD`; backend `DB_PASSWORD`; keycloak `KC_DB_PASSWORD` |
| `KEYCLOAK_ADMIN`           | keycloak `KEYCLOAK_ADMIN`                            |
| `KEYCLOAK_ADMIN_PASSWORD`  | keycloak `KEYCLOAK_ADMIN_PASSWORD`                  |
| `MICROSOFT_CLIENT_ID`      | keycloak (`${MICROSOFT_CLIENT_ID}` in realm JSON)   |
| `MICROSOFT_CLIENT_SECRET`  | keycloak (`${MICROSOFT_CLIENT_SECRET}` in realm JSON)|
| `PROXY_CHECK_API_KEY`      | backend `PROXY_CHECK_API_KEY`                       |

As in docker-compose, a single `POSTGRES_USER` / `POSTGRES_PASSWORD` pair is
shared by both databases.

> The backend and website Pods carry a `checksum/secret` annotation, so changing
> the Secret rolls them automatically.

## Public URLs

The browser and the OIDC issuer must use the **public** (ingress-facing) URLs,
not the in-cluster Service names. These map to `PUBLIC_QUARKUS_HOSTNAME` /
`PUBLIC_KEYCLOAK_HOSTNAME` from the compose `.env`:

| Value                 | Feeds                                              | Default (derived)             |
| --------------------- | -------------------------------------------------- | ----------------------------- |
| `publicUrls.backend`  | website `VITE_BACKEND_HOST`                         | `http(s)://<host>/api`        |
| `publicUrls.keycloak` | website `VITE_KEYCLOAK_HOST`; backend `KEYCLOAK_HOST` (OIDC issuer) | `http(s)://<host>/auth` |

Leave them empty to derive from `ingress.host` and `ingress.tls.enabled`. Set
them explicitly only when the public hostname differs from the ingress host.

The backend's OIDC `auth-server-url` resolves to `${KEYCLOAK_HOST}/realms/Betterfleet`,
so `publicUrls.keycloak` **must** be the address at which end users authenticate
(the token issuer) — that is why it points at the public `/auth` URL rather than
the in-cluster Service.

## WebSockets & long timeouts

Traefik upgrades WebSocket connections (`/api/sessions/...`) automatically — no
annotation needed. However, the original nginx used **7-day** read/send timeouts,
and Traefik's request/idle timeouts live on the **entrypoint** (static config),
not on the Ingress object. On k3s, raise them by applying a `HelmChartConfig`
for the bundled Traefik:

```yaml
# /var/lib/rancher/k3s/server/manifests/traefik-config.yaml
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    ports:
      web:
        transport:
          respondingTimeouts:
            readTimeout: "604800s"     # 7 days
            idleTimeout: "604800s"
            writeTimeout: "604800s"
      websecure:
        transport:
          respondingTimeouts:
            readTimeout: "604800s"
            idleTimeout: "604800s"
            writeTimeout: "604800s"
```

k3s reconciles this automatically. (On a manually installed Traefik, set the same
values in its Helm values.)

## TLS

TLS is **disabled by default** (plain HTTP), matching the compose setup where TLS
was terminated by an external/host proxy. To enable it:

- **Bring your own certificate:**

  ```yaml
  ingress:
    tls:
      enabled: true
      secretName: betterfleet-tls   # a kubernetes.io/tls Secret you create
  ```

- **cert-manager (automatic):**

  ```yaml
  ingress:
    tls:
      enabled: true
      secretName: betterfleet-tls   # cert-manager will populate this
      certManager:
        clusterIssuer: letsencrypt-prod
  ```

  This adds `cert-manager.io/cluster-issuer` to the Ingress. Enabling TLS also
  flips the derived `publicUrls` to `https://`.

## Keycloak realm & custom theme

### Realm import (works via ConfigMap)

`files/betterfleet-realm.json` is rendered into a ConfigMap and mounted at
`/opt/keycloak/data/import`; `start --import-realm` applies it on boot. The
`${MICROSOFT_CLIENT_ID}` / `${MICROSOFT_CLIENT_SECRET}` placeholders inside are
substituted by Keycloak from the container environment (sourced from the Secret)
at import time — exactly as in docker-compose.

### Custom login theme (NOT shipped by default) — build a derived image

The realm sets `"loginTheme": "betterfleet"`. The theme
(`deployment/keycloak/themes/betterfleet/`) contains **binary TTF fonts**, which
do not belong in a ConfigMap, so this chart does **not** mount it. Two consequences:

- **Default behaviour:** without the theme present, Keycloak logs a warning and
  falls back to its built-in `keycloak` login theme. Login still works.
- **To ship the real theme:** build a tiny derived image and point the chart at it.

```dockerfile
# deployment/keycloak/Dockerfile  (build context = deployment/keycloak)
FROM quay.io/keycloak/keycloak:24.0
COPY themes/betterfleet /opt/keycloak/themes/betterfleet
```

```bash
docker build -t your-registry/betterfleet-keycloak:24.0 deployment/keycloak
docker push your-registry/betterfleet-keycloak:24.0
```

```yaml
keycloak:
  image:
    repository: your-registry/betterfleet-keycloak
    tag: "24.0"
```

(Optionally add `--set keycloak.command[0]=start` etc. only if you change the
default `["start","--import-realm"]`.)

## External databases

To use managed PostgreSQL instead of the bundled StatefulSets:

```yaml
postgresApp:
  enabled: false          # do not deploy the app DB
backend:
  database:
    host: my-app-db.internal   # host the backend connects to
    name: BetterFleet

postgresAuth:
  enabled: false          # do not deploy the auth DB
keycloak:
  database:
    host: my-auth-db.internal
    name: Keycloak
```

Credentials still come from the Secret (`POSTGRES_USER` / `POSTGRES_PASSWORD`).

## Values reference (most-used)

| Key | Default | Description |
| --- | --- | --- |
| `nameOverride` / `fullnameOverride` | `""` | Chart/release name overrides. |
| `global.imageRegistry` | `""` | Registry prefix for every image. |
| `global.imagePullSecrets` | `[]` | Pull secrets for every Pod. |
| `serviceAccount.create` | `true` | Create a shared ServiceAccount. |
| `publicUrls.backend` / `.keycloak` | `""` | Public URLs; empty = derive from ingress. |
| `secrets.existingSecret` | `""` | Use a pre-existing Secret instead of rendering one. |
| `secrets.*` | see values | Credentials for the chart-managed Secret. |
| `backend.image.{repository,tag,pullPolicy}` | `zelytra/better-fleet-backend`,`latest`,`IfNotPresent` | Backend image. |
| `backend.replicaCount` / `.resources` / `.probes` | see values | Backend scaling/limits/probes. |
| `website.*` | see values | Website equivalents. |
| `postgresApp.enabled` / `.persistence.{enabled,size,storageClass}` | `true` / `true,5Gi,null` | App DB toggle + storage. |
| `postgresAuth.enabled` / `.persistence.*` | `true` / `true,2Gi,null` | Auth DB toggle + storage. |
| `keycloak.image.{repository,tag}` | `quay.io/keycloak/keycloak`,`24.0` | Keycloak image (override to ship the theme). |
| `keycloak.command` | `["start","--import-realm"]` | Startup args. |
| `keycloak.realmImport.enabled` | `true` | Mount + import the realm ConfigMap. |
| `keycloak.health.enabled` | `false` | Expose `/health` on a management port. |
| `ingress.enabled` | `true` | Create the Ingress objects. |
| `ingress.className` | `traefik` | IngressClass. |
| `ingress.host` | `betterfleet.fr` | Public host for all routes. |
| `ingress.api.stripPrefix` | `true` | Strip `/api` (Traefik Middleware). |
| `ingress.tls.enabled` | `false` | Enable HTTPS. |
| `ingress.tls.secretName` | `betterfleet-tls` | TLS Secret name. |
| `ingress.tls.certManager.clusterIssuer` | `""` | cert-manager issuer annotation. |

Storage note: `persistence.storageClass: null` uses the cluster default
(`local-path` on k3s). Set a name to pin a specific class.

## Probes

- **backend / website:** HTTP `GET /`. The backend's `/` returns `Pong!`
  (`fr.zelytra.PublicEndpoints`); the website serves `index.html`.
- **postgres-app / postgres-auth:** `pg_isready` exec probe.
- **keycloak:** TCP startup/liveness on `:8080` and readiness `GET /auth/realms/master`.
  Keycloak's HTTP health endpoints are disabled by default; set
  `keycloak.health.enabled=true` to expose them on a management port and repoint
  the probes via `keycloak.probes.*` if you prefer `/health/ready` + `/health/live`.

## Notes on fidelity to docker-compose

- Compose's `KC_VAULT_FILE` and `KC_OVERRIDE` env vars were **intentionally
  dropped**: the former pointed at an unmounted path and the latter is not a
  recognised Keycloak 24 option (both were no-ops). Re-add via `keycloak.extraEnv`
  if you depend on them.
- `PGDATA` is set to the `pgdata` sub-directory of the mounted volume to keep
  `initdb` happy on volumes that pre-create `lost+found`.
- The published host ports from compose (2600–2604) are **not** exposed; traffic
  enters exclusively through the Ingress. Use `kubectl port-forward` for direct
  DB/Keycloak access during debugging.

## Uninstall

```bash
helm uninstall betterfleet -n betterfleet
# PVCs created by StatefulSets are retained by design; remove them explicitly:
kubectl -n betterfleet delete pvc -l app.kubernetes.io/instance=betterfleet
```
