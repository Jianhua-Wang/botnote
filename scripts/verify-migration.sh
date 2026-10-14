#!/bin/bash
# Rehearse pending migrations against a copy of the production database and
# prove they do not change the data they should not touch.
#
#   scripts/verify-migration.sh                 dump prod now, restore into botnote_staging, migrate, diff
#   scripts/verify-migration.sh path/to/dump.sql.gz   same, from an existing dump (e.g. ~/botnote-backups/daily/...)
#   scripts/verify-migration.sh --serve         additionally boot the built daemon on :4281 against staging
#                                               and hit /health, then stop it
#
# Run it from the checkout whose migrations you want to test (the dev worktree).
# It never connects the migration runner to the production database: the
# DATABASE_URL it passes points at the staging copy, and the staging name must
# differ from the production name.
#
# Exit status: 0 when every invariant that is expected to stay equal did, 1 otherwise.
# Invariants live in scripts/invariants.sql. A migration that intentionally
# changes a metric (a data repair) lists it in ALLOW_CHANGED, e.g.
#   ALLOW_CHANGED="entities_self_parent entities_with_parent" scripts/verify-migration.sh
#
# Environment overrides:
#   BOTNOTE_PG_DOCKER   (botnote-postgres)   BOTNOTE_PG_DB        (botnote)
#   BOTNOTE_PG_PORT     (55434)              BOTNOTE_STAGING_DB   (botnote_staging)
#   BOTNOTE_STAGING_PORT (4281)              ALLOW_CHANGED        ("")
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PG_DOCKER="${BOTNOTE_PG_DOCKER:-botnote-postgres}"
PG_DB="${BOTNOTE_PG_DB:-botnote}"
PG_PORT="${BOTNOTE_PG_PORT:-55434}"
STAGING_DB="${BOTNOTE_STAGING_DB:-botnote_staging}"
STAGING_PORT="${BOTNOTE_STAGING_PORT:-4281}"
ALLOW_CHANGED="${ALLOW_CHANGED:-}"
WORK_DIR="${TMPDIR:-/tmp}/botnote-verify-$(date +%Y%m%d-%H%M%S)"
SERVE=0
DUMP=""

for arg in "$@"; do
  case "$arg" in
    --serve) SERVE=1 ;;
    *) DUMP="$arg" ;;
  esac
done

log() { printf '\033[1;34m[verify]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[verify] %s\033[0m\n' "$*" >&2; exit 1; }

[ "$STAGING_DB" != "$PG_DB" ] || die "staging database must not be the production database"
case "$STAGING_DB" in *staging*|*test*) ;; *) die "staging database name must contain 'staging' or 'test'; got $STAGING_DB" ;; esac

DOCKER="$(command -v docker || echo /usr/local/bin/docker)"
psql_admin() { "$DOCKER" exec -i "$PG_DOCKER" psql -U botnote -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_staging() { "$DOCKER" exec -i "$PG_DOCKER" psql -U botnote -d "$STAGING_DB" -v ON_ERROR_STOP=1 -q "$@"; }

mkdir -p "$WORK_DIR"
log "work dir: $WORK_DIR"

if [ -z "$DUMP" ]; then
  DUMP="$WORK_DIR/prod.sql.gz"
  log "dumping $PG_DB -> $DUMP"
  "$DOCKER" exec "$PG_DOCKER" pg_dump -U botnote -d "$PG_DB" --no-owner --no-privileges | gzip > "$DUMP"
else
  [ -f "$DUMP" ] || die "dump not found: $DUMP"
  log "using dump $DUMP"
fi

log "recreating $STAGING_DB"
psql_admin -c "DROP DATABASE IF EXISTS $STAGING_DB WITH (FORCE)"
psql_admin -c "CREATE DATABASE $STAGING_DB"
# --clean dumps carry DROP statements for objects that do not exist yet in a
# fresh database; those errors are harmless, so restore without ON_ERROR_STOP.
gunzip -c "$DUMP" | "$DOCKER" exec -i "$PG_DOCKER" psql -U botnote -d "$STAGING_DB" -q >"$WORK_DIR/restore.log" 2>&1 || true
if ! psql_staging -Atc "SELECT 1 FROM _migrations LIMIT 1" >/dev/null 2>&1; then
  die "restore did not produce a botnote schema; see $WORK_DIR/restore.log"
fi

applied_before="$(psql_staging -Atc "SELECT count(*) FROM _migrations")"
log "restored; $applied_before migrations recorded"

log "snapshot: before"
psql_staging -f - < "$REPO_DIR/scripts/invariants.sql" > "$WORK_DIR/before.txt"

if [ ! -f "$REPO_DIR/dist/db/migrate.js" ] || [ "$REPO_DIR/src/db/migrate.ts" -nt "$REPO_DIR/dist/db/migrate.js" ]; then
  log "building server (dist is missing or stale)"
  (cd "$REPO_DIR" && pnpm build:server >"$WORK_DIR/build.log" 2>&1) || die "build failed; see $WORK_DIR/build.log"
fi

STAGING_URL="postgres://botnote:botnote@127.0.0.1:$PG_PORT/$STAGING_DB"
log "running migrations from $REPO_DIR against $STAGING_DB"
(cd "$REPO_DIR" && DATABASE_URL="$STAGING_URL" node dist/db/migrate.js) | tee "$WORK_DIR/migrate.log" | sed 's/^/    /'

applied_after="$(psql_staging -Atc "SELECT count(*) FROM _migrations")"
log "migrations recorded: $applied_before -> $applied_after"

log "snapshot: after"
psql_staging -f - < "$REPO_DIR/scripts/invariants.sql" > "$WORK_DIR/after.txt"

if [ "$SERVE" = 1 ]; then
  log "booting daemon on :$STAGING_PORT against $STAGING_DB"
  (cd "$REPO_DIR" && DATABASE_URL="$STAGING_URL" BOTNOTE_PORT="$STAGING_PORT" BOTNOTE_HOST=127.0.0.1 \
     BOTNOTE_LOG_LEVEL=warn OPENAI_API_KEY= node dist/cli.js >"$WORK_DIR/daemon.log" 2>&1) &
  DAEMON_PID=$!
  trap 'kill $DAEMON_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:$STAGING_PORT/health" >"$WORK_DIR/health.json" 2>/dev/null; then break; fi
    sleep 1
  done
  [ -s "$WORK_DIR/health.json" ] || die "daemon on :$STAGING_PORT never became healthy; see $WORK_DIR/daemon.log"
  log "health: $(cat "$WORK_DIR/health.json")"
  curl -fsS "http://127.0.0.1:$STAGING_PORT/v1/projects" >"$WORK_DIR/projects.json" \
    && log "GET /v1/projects ok ($(wc -c <"$WORK_DIR/projects.json" | tr -d ' ') bytes)"
  { kill $DAEMON_PID && wait $DAEMON_PID; } 2>/dev/null || true
  trap - EXIT
fi

log "comparing invariants"
status=0
while IFS='|' read -r metric before; do
  after="$(grep -F -m1 "${metric}|" "$WORK_DIR/after.txt" | cut -d'|' -f2- || true)"
  if [ "$before" = "$after" ]; then
    continue
  fi
  name="${metric%%:*}"
  if grep -qw -- "$name" <<<"$ALLOW_CHANGED"; then
    printf '    allowed  %-50s %s -> %s\n' "$metric" "$before" "${after:-<missing>}"
  else
    printf '    \033[1;31mCHANGED\033[0m  %-50s %s -> %s\n' "$metric" "$before" "${after:-<missing>}"
    status=1
  fi
done < "$WORK_DIR/before.txt"

while IFS='|' read -r metric after; do
  grep -qF "${metric}|" "$WORK_DIR/before.txt" || printf '    new      %-50s %s\n' "$metric" "$after"
done < "$WORK_DIR/after.txt"

if [ "$status" = 0 ]; then
  log "PASS: all invariants held ($(wc -l <"$WORK_DIR/before.txt" | tr -d ' ') metrics). Snapshots in $WORK_DIR"
else
  die "FAIL: unexpected changes. Snapshots in $WORK_DIR (before.txt / after.txt). If the change is intended, rerun with ALLOW_CHANGED=\"<metric names>\"."
fi
