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
# How long to wait for a database to accept connections before giving up on this run.
WAIT_ATTEMPTS="${BACKUP_WAIT_ATTEMPTS:-30}"
WAIT_SECONDS="${BACKUP_WAIT_SECONDS:-2}"

# `depends_on: condition: service_healthy` only guards `docker compose up`. After a host reboot
# dockerd restarts every container independently through `restart: unless-stopped`, so this
# container can - and did - reach pg_dump before Postgres had opened its socket. Waiting here is
# what makes the ordering real on that path; without it the run failed and the next attempt was a
# whole BACKUP_INTERVAL_SECONDS away (24h).
wait_for() {
    host="$1"
    attempt=1
    while [ "$attempt" -le "$WAIT_ATTEMPTS" ]; do
        if pg_isready --host="$host" --username="$POSTGRES_USER" >/dev/null 2>&1; then
            return 0
        fi
        [ "$WAIT_SECONDS" -gt 0 ] && sleep "$WAIT_SECONDS"
        attempt=$((attempt + 1))
    done
    echo "[backup] $host did not accept connections after ${WAIT_ATTEMPTS} attempts" >&2
    return 1
}

dump() {
    host="$1"
    database="$2"
    target="${BACKUP_DIR}/${database}-${STAMP}.sql.gz"
    # One error file per database: when both dumps fail in the same run, a single shared path kept
    # only the second message, losing the first failure a human would need to read.
    errfile="/tmp/dump-err-${database}"
    failed="/tmp/dump-failed-${database}"
    wait_for "$host" || return 1
    rm -f "$failed"
    # Dump to a .part file and rename only on success: an interrupted run (container stopped, disk
    # full) must never leave a truncated file that looks like a usable backup.
    #
    # pg_dump's own exit status is recorded on DISK rather than read from the pipeline, because a
    # pipeline reports only its LAST command: `if pg_dump | gzip` tested gzip, and gzip fed an
    # empty stdin - pg_dump having died on "connection refused" - exits 0 and writes a valid
    # 20-byte stream. The rename fired and a corrupt file landed under a perfectly normal name,
    # which is what production did after the 2026-09-01 host reboot (#878); a dump dying PARTWAY
    # was worse still - renamed, past the content check, exit 0, a backup reported as good.
    # `set -o pipefail` would fix it too, but it is not POSIX (dash has no such option), and a
    # backup script must not owe its central guarantee to which shell happens to run it.
    { pg_dump --host="$host" --username="$POSTGRES_USER" --dbname="$database" --format=plain \
        --no-owner --no-privileges 2>"$errfile" || echo failed >"$failed"; } | gzip -9 >"${target}.part"
    if [ ! -f "$failed" ]; then
        mv "${target}.part" "$target"
        echo "[backup] $database -> $(basename "$target") ($(wc -c <"$target") bytes)"
    else
        rm -f "${target}.part" "$failed"
        echo "[backup] FAILED to dump $database from $host: $(cat "$errfile")" >&2
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
