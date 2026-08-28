#!/bin/sh
# Dumps both BetterFleet databases, then prunes old dumps. Run by the `backup` service in
# deployment/docker-compose.yml on a loop; also runnable by hand for an out-of-cycle dump:
#
#   docker compose run --rm backup /backup.sh
#
# Two separate dumps rather than one pg_dumpall: the databases live in different containers, and a
# per-database file is what a restore actually wants - losing the app data and losing every Keycloak
# account are different incidents with different recoveries (#860).
#
# pg_dump over the network, never a copy of psql-data/: a filesystem copy of a RUNNING pgdata is not
# a backup - it is a snapshot of pages mid-write, which restores into a corrupt cluster often enough
# to be worthless. The one artifact production had (a July tarball of psql-data) has that exact
# problem on top of being stale.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

dump() {
    host="$1"
    database="$2"
    target="${BACKUP_DIR}/${database}-${STAMP}.sql.gz"
    # Dump to a .part file and rename only on success: an interrupted run (container stopped, disk
    # full) must never leave a truncated file that looks like a usable backup.
    if pg_dump --host="$host" --username="$POSTGRES_USER" --dbname="$database" --format=plain \
        --no-owner --no-privileges 2>/tmp/dump-err | gzip -9 >"${target}.part"; then
        mv "${target}.part" "$target"
        echo "[backup] $database -> $(basename "$target") ($(wc -c <"$target") bytes)"
    else
        rm -f "${target}.part"
        echo "[backup] FAILED to dump $database from $host: $(cat /tmp/dump-err)" >&2
        return 1
    fi
}

mkdir -p "$BACKUP_DIR"

# Both dumps are attempted even if the first fails: a broken auth database must not cost the app
# backup too. The exit code still reports the failure so a supervisor can alert on it.
status=0
dump postgres-app BetterFleet || status=1
dump postgres-auth Keycloak || status=1

# Prune by age, and only our own files: the pattern is anchored to the two database names so a
# stray file in a shared directory is never deleted by this script.
for database in BetterFleet Keycloak; do
    find "$BACKUP_DIR" -maxdepth 1 -name "${database}-*.sql.gz" -type f \
        -mtime "+${RETENTION_DAYS}" -print -delete
done

# A dump of an EMPTY database is a failure that looks like a success: pg_dump exits 0, gzip exits 0,
# and a file lands with a plausible name. Checked by content rather than by size - a size threshold
# either misses a small real database or cries wolf on one (measured: an empty database gzips to
# ~370 bytes, a two-row one to ~765, so no threshold separates them safely). A dump that declares no
# table is the honest signal, and it stays honest whatever the database weighs.
for database in BetterFleet Keycloak; do
    newest="$(ls -t "${BACKUP_DIR}/${database}-"*.sql.gz 2>/dev/null | head -n 1 || true)"
    [ -n "$newest" ] || continue
    if ! gzip -dc "$newest" | grep -qE '^(CREATE TABLE|COPY )'; then
        echo "[backup] WARNING: $(basename "$newest") declares no table - is $database really populated?" >&2
        status=1
    fi
done

exit "$status"
