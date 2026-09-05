#!/bin/sh
# Contract tests for backup.sh, run against fake pg_dump/pg_isready binaries on PATH so no database
# - and no container - is needed. Executed by CI (.github/workflows/ci.yml) on every change to the
# deployment directory.
#
# Every case here comes from a real production failure or the guarantee the script claims for
# itself: after the 2026-09-01 host reboot the backup service raced Postgres and renamed two EMPTY
# dumps into place as if they were valid (#878), which the ".part rename only on success" comment
# says is impossible.
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_SH="${SCRIPT_DIR}/backup.sh"
failures=0
checks=0

fail() {
    failures=$((failures + 1))
    echo "  FAIL: $1" >&2
}

check() {
    checks=$((checks + 1))
    if [ "$2" = "$3" ]; then
        return 0
    fi
    fail "$1 (expected '$3', got '$2')"
}

# A sandbox with a fake pg_dump whose behaviour is chosen per test, plus an empty backup dir.
setup() {
    WORK="$(mktemp -d)"
    mkdir -p "$WORK/bin" "$WORK/backups"
    PATH="$WORK/bin:$PATH"
    export PATH
    export BACKUP_DIR="$WORK/backups"
    export POSTGRES_USER=test
    export BACKUP_RETENTION_DAYS=14
    # Never make a test wait on real backoff.
    export BACKUP_WAIT_ATTEMPTS=3
    export BACKUP_WAIT_SECONDS=0
}

teardown() {
    rm -rf "$WORK"
}

fake_pg_isready_ok() {
    cat > "$WORK/bin/pg_isready" <<'EOF'
#!/bin/sh
exit 0
EOF
    chmod +x "$WORK/bin/pg_isready"
}

dumps_in_backup_dir() {
    find "$BACKUP_DIR" -maxdepth 1 -name '*.sql.gz' -type f 2>/dev/null | wc -l | tr -d ' '
}

echo "== a dump that cannot connect leaves NO file behind"
setup
fake_pg_isready_ok
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/bin/sh
echo 'pg_dump: error: connection to server at "postgres-app" failed: Connection refused' >&2
exit 1
EOF
chmod +x "$WORK/bin/pg_dump"
sh "$BACKUP_SH" >"$WORK/out" 2>"$WORK/err" && rc=0 || rc=$?
check "exit code reports the failure" "$rc" "1"
check "no dump file was kept" "$(dumps_in_backup_dir)" "0"
check "no .part file was left behind" "$(find "$BACKUP_DIR" -name '*.part' | wc -l | tr -d ' ')" "0"
teardown

echo "== a dump that dies PARTWAY leaves no file either"
setup
fake_pg_isready_ok
# The insidious shape: some real SQL is already flushed to gzip, so a content check cannot tell
# this apart from a good dump. Only pg_dump's exit status can.
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/bin/sh
echo "CREATE TABLE public.session (id integer);"
echo "COPY public.session (id) FROM stdin;"
echo 'pg_dump: error: connection to server lost mid-dump' >&2
exit 1
EOF
chmod +x "$WORK/bin/pg_dump"
sh "$BACKUP_SH" >"$WORK/out" 2>"$WORK/err" && rc=0 || rc=$?
check "a truncated dump is a failure" "$rc" "1"
check "a truncated dump is not kept" "$(dumps_in_backup_dir)" "0"
teardown

echo "== a healthy run keeps both dumps and exits 0"
setup
fake_pg_isready_ok
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/bin/sh
echo "CREATE TABLE public.session (id integer);"
echo "COPY public.session (id) FROM stdin;"
echo "1"
echo "\\."
exit 0
EOF
chmod +x "$WORK/bin/pg_dump"
sh "$BACKUP_SH" >"$WORK/out" 2>"$WORK/err" && rc=0 || rc=$?
check "a healthy run succeeds" "$rc" "0"
check "both databases were dumped" "$(dumps_in_backup_dir)" "2"
teardown

echo "== both databases failing keep BOTH error messages"
setup
fake_pg_isready_ok
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/bin/sh
for arg in "$@"; do
    case "$arg" in --dbname=*) db="${arg#--dbname=}" ;; esac
done
echo "pg_dump: error: could not reach ${db}" >&2
exit 1
EOF
chmod +x "$WORK/bin/pg_dump"
sh "$BACKUP_SH" >"$WORK/out" 2>"$WORK/err" && rc=0 || rc=$?
grep -q "could not reach BetterFleet" "$WORK/err" && a=yes || a=no
grep -q "could not reach Keycloak" "$WORK/err" && b=yes || b=no
check "the app database error survives" "$a" "yes"
check "the auth database error survives" "$b" "yes"
teardown

echo "== a Postgres still starting is waited for, not raced"
setup
# The #878 shape: the backup container starts at the same instant as Postgres (dockerd restarting
# everything after a host reboot, where depends_on does not apply) and must wait rather than dump
# into a refused connection and sleep for a whole interval.
cat > "$WORK/bin/pg_isready" <<'EOF'
#!/bin/sh
counter="$WORK_STATE/isready-count"
n=$(cat "$counter" 2>/dev/null || echo 0)
n=$((n + 1))
echo "$n" > "$counter"
[ "$n" -ge 3 ] || exit 1
exit 0
EOF
chmod +x "$WORK/bin/pg_isready"
mkdir -p "$WORK/state"
WORK_STATE="$WORK/state"
export WORK_STATE
# pg_dump refuses for exactly as long as pg_isready does: without a wait loop the script dumps
# straight into a refused connection, which is what made the test discriminating - it fails on the
# shipped script and passes only once the wait exists.
cat > "$WORK/bin/pg_dump" <<'EOF'
#!/bin/sh
n=$(cat "$WORK_STATE/isready-count" 2>/dev/null || echo 0)
if [ "$n" -lt 3 ]; then
    echo 'pg_dump: error: connection refused - the server is still starting' >&2
    exit 1
fi
echo "CREATE TABLE public.session (id integer);"
echo "COPY public.session (id) FROM stdin;"
exit 0
EOF
chmod +x "$WORK/bin/pg_dump"
sh "$BACKUP_SH" >"$WORK/out" 2>"$WORK/err" && rc=0 || rc=$?
check "the run recovers once Postgres accepts connections" "$rc" "0"
check "both databases were dumped after the wait" "$(dumps_in_backup_dir)" "2"
teardown

echo
if [ "$failures" -eq 0 ]; then
    echo "backup.sh: $checks checks passed"
    exit 0
fi
echo "backup.sh: $failures of $checks checks FAILED"
exit 1
