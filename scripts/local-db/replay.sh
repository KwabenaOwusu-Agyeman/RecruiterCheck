#!/usr/bin/env bash
# Rebuilds a throwaway LOCAL Postgres from supabase/migrations, for machines
# without Docker (where `supabase start` and `supabase db reset` cannot run).
#
#   scripts/local-db/replay.sh           replay every migration
#   scripts/local-db/replay.sh psql      open psql on the replayed database
#
# Needs Postgres 16 binaries (initdb, pg_ctl, psql) on PATH. The cluster lives
# in .scratch/local-db (gitignored) and listens on 127.0.0.1:54399 only.
# Supabase platform objects are stubbed by bootstrap.sql, and CREATE/DROP
# EXTENSION lines are skipped because pg_cron and pg_net are stubbed there.
#
# What it proves: every migration applies in order, and the resulting
# functions, triggers, policies and grants behave as written (probe them with
# SET ROLE anon/authenticated/service_role and request.jwt.claims). What it
# does not: Storage, Auth or anything in the hosted project, which may differ
# from the repository (see COCKPIT.md). It never connects anywhere but
# 127.0.0.1, and it cannot: the connection string below is fixed.
set -euo pipefail
export LC_ALL=en_US.UTF-8 LANG=en_US.UTF-8

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
DATA="$REPO/.scratch/local-db/data"
LOG="$REPO/.scratch/local-db/postgres.log"
PORT=54399
PSQL=(psql -h 127.0.0.1 -p "$PORT" -U postgres -d postgres -X -v ON_ERROR_STOP=1)

if [[ "${1:-}" == "psql" ]]; then
  exec "${PSQL[@]}" "${@:2}"
fi

mkdir -p "$(dirname "$DATA")"
if [[ -d "$DATA" ]]; then pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; fi
rm -rf "$DATA"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-p $PORT -k '' -c listen_addresses=127.0.0.1" -l "$LOG" -w start >/dev/null

"${PSQL[@]}" -q -f "$HERE/bootstrap.sql"
count=0
for file in "$REPO"/supabase/migrations/*.sql; do
  if ! sed -E 's/^[[:space:]]*(create|drop) extension[^;]*;//I' "$file" | "${PSQL[@]}" -q >/dev/null 2>"$REPO/.scratch/local-db/last-error.txt"; then
    echo "FAILED: $(basename "$file")"
    cat "$REPO/.scratch/local-db/last-error.txt"
    exit 1
  fi
  count=$((count + 1))
done
echo "replayed $count migrations on 127.0.0.1:$PORT (stop with: pg_ctl -D .scratch/local-db/data stop)"
