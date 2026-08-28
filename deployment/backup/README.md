# Database backups

Both BetterFleet databases are dumped on a schedule by the `backup` service in
[`../docker-compose.yml`](../docker-compose.yml). It starts with the rest of the stack, dumps once
immediately, then every `BACKUP_INTERVAL_SECONDS`.

| Database | Container | What is in it | Dump file |
|---|---|---|---|
| `BetterFleet` | `betterfleet-postgres-app` | player reports, statistics history, alliance stats | `backups/BetterFleet-<UTC stamp>.sql.gz` |
| `Keycloak` | `betterfleet-postgres-auth` | the realm, i.e. **every registered account** | `backups/Keycloak-<UTC stamp>.sql.gz` |

**`psql-data/` is not a backup.** Copying a directory PostgreSQL is writing to captures pages
mid-write; the result restores into a corrupt cluster often enough to be worthless. That is why
these are `pg_dump` dumps taken over the network, and why a tarball of `psql-data/` should never be
trusted as the recovery path.

## Configuration

Everything has a working default; set these in `.env` only to change them.

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_INTERVAL_SECONDS` | `86400` (daily) | Delay between runs. |
| `BACKUP_RETENTION_DAYS` | `14` | Dumps older than this are pruned, `BetterFleet-*`/`Keycloak-*` only — other files in the directory are never touched. |

## The part this does not do for you

The dumps land in `./backups/` **on the same disk as the databases**. That covers a bad command, a
dropped table, a broken migration — not a dead disk or a lost host. Copy the directory off the
machine on a schedule (rsync to another box, a provider snapshot, an object-storage sync); until
that exists, the backup story is only half told.

## Restore

Restoring writes over live data. Stop the services that talk to the database first (`backend` for
the app database, `keycloak` for the auth one), restore, then start them again.

```bash
# App database: reports, statistics.
docker compose stop backend
gzip -dc backups/BetterFleet-20260828-212624.sql.gz \
  | docker compose exec -T postgres-app psql --username="$POSTGRES_USER" --dbname=BetterFleet
docker compose start backend
```

```bash
# Auth database: every account. Keycloak must be down while its schema is replaced.
docker compose stop keycloak
gzip -dc backups/Keycloak-20260828-212624.sql.gz \
  | docker compose exec -T postgres-auth psql --username="$POSTGRES_USER" --dbname=Keycloak
docker compose start keycloak
```

The dumps carry no `DROP` statements (`--no-owner --no-privileges`, plain format), so restoring on
top of existing tables reports "already exists" errors and leaves rows as they are. To restore
*over* a damaged database, drop and recreate it first:

```bash
docker compose exec -T postgres-app psql --username="$POSTGRES_USER" --dbname=postgres \
  -c 'DROP DATABASE "BetterFleet";' -c 'CREATE DATABASE "BetterFleet";'
```

## Running one out of cycle

```bash
docker compose exec backup sh /backup.sh
```

## Checking it works

```bash
docker logs betterfleet-backup --tail 20
```

A healthy run prints one line per database with the file name and its size. Two failure modes speak
up on their own: a dump that fails is reported with the `pg_dump` error and leaves no `.part` file
behind, and a dump that succeeds against an **empty** database warns that it declares no table —
the failure that would otherwise look exactly like a success.

## Verified

The full cycle was exercised against two live PostgreSQL 14 containers before this shipped: seed →
dump → `DROP TABLE` → restore → rows back, plus retention pruning (old dumps removed, unrelated
files in the same directory untouched).
