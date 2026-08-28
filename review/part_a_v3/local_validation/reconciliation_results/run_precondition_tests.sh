#!/bin/bash
# Tests for the fail-closed purchase-row precondition, run against real
# local disposable Postgres databases, for BOTH 01_production_migration.sql
# and 02_test_reconciliation.sql.
set -u
export PATH="/usr/local/opt/postgresql@16/bin:$PATH"
export LC_ALL="en_US.UTF-8"
ROOT="/Users/Other/Projects/RecruiterCheck/review/part_a_v3"
RESULTS="precondition_results.log"
: > "$RESULTS"
PASS=0
FAIL=0

log() { echo "$@" | tee -a "$RESULTS"; }

assert() {
  local desc="$1" cond="$2"
  if [ "$cond" = "1" ]; then log "PASS: $desc"; PASS=$((PASS+1));
  else log "FAIL: $desc"; FAIL=$((FAIL+1)); fi
}

# The exact new-column statement both migrations add in Section B / Step 8 --
# used here only to bring a fresh pre-Part-A database far enough forward to
# populate realistic test facts, matching what a real reconciliation would
# see on rerun (idempotent, IF NOT EXISTS, safe to run before the real file).
NEW_COLUMNS_SQL="alter table public.credit_batches
  add column if not exists keyword_scans_granted integer not null default 0 check (keyword_scans_granted >= 0),
  add column if not exists keyword_scans_remaining integer not null default 0 check (keyword_scans_remaining >= 0),
  add column if not exists refund_status text not null default 'active' check (refund_status in ('active','refund_pending','refunded')),
  add column if not exists stripe_price_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists amount_paid integer,
  add column if not exists currency text,
  add column if not exists quantity integer;"

fresh_db_01() {
  local db="$1"
  dropdb --if-exists "$db" > /dev/null 2>&1
  createdb "$db"
  psql -d "$db" -q -v ON_ERROR_STOP=1 -f "$ROOT/local_validation/00_stub_schema.sql" > /dev/null
  psql -d "$db" -q -c "create table if not exists cron.job (jobname text);" > /dev/null
  psql -d "$db" -q -c "insert into auth.users (id) values ('a0000000-0000-0000-0000-00000000000a');" > /dev/null
  psql -d "$db" -q -c "insert into public.profiles (id) values ('a0000000-0000-0000-0000-00000000000a');" > /dev/null
  psql -d "$db" -q -c "grant authenticated to current_user; grant service_role to current_user; grant anon to current_user;" > /dev/null 2>&1
  psql -d "$db" -q -v ON_ERROR_STOP=1 -c "$NEW_COLUMNS_SQL" > /dev/null
}

# fresh_db_02 <dbname>: prior-draft schema, for 02_test_reconciliation.sql.
# Strips the item-2 demo fixture rows (and their dependent reservations) so
# these precondition tests start from a genuinely clean credit_batches
# baseline, independent of item 2's own fixture-preservation test.
fresh_db_02() {
  local db="$1"
  dropdb --if-exists "$db" > /dev/null 2>&1
  createdb "$db"
  psql -d "$db" -q -v ON_ERROR_STOP=1 -f "$ROOT/local_validation/00b_stub_prior_draft_schema.sql" > /dev/null
  psql -d "$db" -q -c "
    delete from public.keyword_scan_reservations where batch_id is not null;
    delete from public.credit_batches;
  " > /dev/null
  psql -d "$db" -q -c "grant authenticated to current_user; grant service_role to current_user; grant anon to current_user;" > /dev/null 2>&1
  psql -d "$db" -q -v ON_ERROR_STOP=1 -c "$NEW_COLUMNS_SQL" > /dev/null
}

insert_batch() {
  # insert_batch <db> <id> <source> <pi> <cs> <price> <pack> <amount> <ccy> <qty> <paid_at_expr> <checks_granted> <expires_expr>
  local db="$1" id="$2" source="$3" pi="$4" cs="$5" price="$6" pack="$7" amount="$8" ccy="$9" qty="${10}" paid_at="${11}" cg="${12}" exp="${13}"
  psql -d "$db" -q -v ON_ERROR_STOP=1 -c "
    insert into public.credit_batches (id, user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, stripe_checkout_session_id, stripe_price_id, pack_id, amount_paid, currency, quantity, paid_at, granted_at, expires_at)
    values ('$id', 'a0000000-0000-0000-0000-00000000000a', '$source', $cg, $cg, $cg, $cg, $pi, $cs, $price, $pack, $amount, $ccy, $qty, $paid_at, now(), $exp);
  "
}

run_migration() {
  # run_migration <db> <file> -> sets LAST_EXIT, LAST_LOG
  local db="$1" file="$2"
  LAST_LOG="/tmp/precond_test_$$_$(basename "$file").log"
  psql -d "$db" -v ON_ERROR_STOP=1 -f "$file" > "$LAST_LOG" 2>&1
  LAST_EXIT=$?
}

test_flavor() {
  local flavor="$1" file="$2" fresh_fn="$3"
  log ""
  log "############################################################"
  log "# Testing $flavor ($file)"
  log "############################################################"

  # 1. Zero purchase rows: migration succeeds.
  local db="precond_${flavor}_zero"
  $fresh_fn "$db"
  run_migration "$db" "$file"
  assert "[$flavor] zero purchase rows -> migration succeeds (exit $LAST_EXIT)" "$([ $LAST_EXIT -eq 0 ] && echo 1 || echo 0)"

  # 2. Valid fully verified purchase row: migration succeeds and preserves it.
  db="precond_${flavor}_valid"
  $fresh_fn "$db"
  insert_batch "$db" "d0000000-0000-0000-0000-000000000001" "purchase" "'pi_valid_001'" "'cs_valid_001'" "'price_valid_001'" "'small'" 1000 "'eur'" 1 "now() - interval '1 day'" 5 "now() + interval '89 days'"
  run_migration "$db" "$file"
  PRESERVED=$(psql -d "$db" -q -t -A -c "select count(*) from public.credit_batches where stripe_payment_intent_id='pi_valid_001';" 2>/dev/null | tr -d '[:space:]')
  assert "[$flavor] valid fully-verified purchase row -> migration succeeds (exit $LAST_EXIT)" "$([ $LAST_EXIT -eq 0 ] && echo 1 || echo 0)"
  assert "[$flavor] valid purchase row preserved after migration (count=$PRESERVED)" "$([ "$PRESERVED" = "1" ] && echo 1 || echo 0)"

  # 3. Purchase missing each required fact individually: migration fails.
  local -a FIELDS=(stripe_payment_intent_id stripe_checkout_session_id stripe_price_id pack_id amount_paid currency quantity paid_at expires_at)
  for field in "${FIELDS[@]}"; do
    db="precond_${flavor}_missing_${field}"
    $fresh_fn "$db"
    local pi="'pi_missing_${field}'" cs="'cs_missing_${field}'" price="'price_missing_${field}'" pack="'small'" amount=1000 ccy="'eur'" qty=1 paid_at="now() - interval '1 day'" exp="now() + interval '89 days'"
    case "$field" in
      stripe_payment_intent_id) pi="null" ;;
      stripe_checkout_session_id) cs="null" ;;
      stripe_price_id) price="null" ;;
      pack_id) pack="null" ;;
      amount_paid) amount="null" ;;
      currency) ccy="null" ;;
      quantity) qty="null" ;;
      paid_at) paid_at="null" ;;
      expires_at) exp="null" ;;
    esac
    insert_batch "$db" "d0000000-0000-0000-0000-000000000002" "purchase" "$pi" "$cs" "$price" "$pack" "$amount" "$ccy" "$qty" "$paid_at" 5 "$exp" > /dev/null
    run_migration "$db" "$file"
    HAS_CONSTRAINT=$(psql -d "$db" -q -t -A -c "select count(*) from pg_constraint where conname='credit_batches_purchase_verified_facts_check';" 2>/dev/null | tr -d '[:space:]')
    assert "[$flavor] purchase missing $field -> migration fails (exit $LAST_EXIT), constraint never added ($HAS_CONSTRAINT)" "$([ $LAST_EXIT -ne 0 ] && [ "$HAS_CONSTRAINT" = "0" ] && echo 1 || echo 0)"
  done

  # 4. Manual-grant rows without Stripe facts: migration succeeds.
  db="precond_${flavor}_manualgrant"
  $fresh_fn "$db"
  psql -d "$db" -q -v ON_ERROR_STOP=1 -c "
    insert into public.credit_batches (id, user_id, source, checks_granted, checks_remaining, granted_at, expires_at)
    values ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a', 'manual_grant', 3, 3, now(), null);
  " > /dev/null
  run_migration "$db" "$file"
  assert "[$flavor] manual_grant row without Stripe facts -> migration succeeds (exit $LAST_EXIT)" "$([ $LAST_EXIT -eq 0 ] && echo 1 || echo 0)"

  # 5. Unknown/unexpected source value: migration fails.
  db="precond_${flavor}_unknownsource"
  $fresh_fn "$db"
  psql -d "$db" -q -c "alter table public.credit_batches drop constraint if exists credit_batches_source_check;" > /dev/null
  psql -d "$db" -q -v ON_ERROR_STOP=1 -c "
    insert into public.credit_batches (id, user_id, source, checks_granted, checks_remaining, granted_at, expires_at)
    values ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-00000000000a', 'promo_credit', 3, 3, now(), null);
  " > /dev/null
  run_migration "$db" "$file"
  assert "[$flavor] unknown source value 'promo_credit' -> migration fails (exit $LAST_EXIT)" "$([ $LAST_EXIT -ne 0 ] && echo 1 || echo 0)"

  # 6. Purchase with null expiry: migration fails (explicit, distinct scenario).
  db="precond_${flavor}_nullexpiry"
  $fresh_fn "$db"
  insert_batch "$db" "d0000000-0000-0000-0000-000000000005" "purchase" "'pi_nullexpiry_001'" "'cs_nullexpiry_001'" "'price_nullexpiry_001'" "'small'" 1000 "'eur'" 1 "now() - interval '1 day'" 5 "null" > /dev/null
  run_migration "$db" "$file"
  assert "[$flavor] purchase with null expiry -> migration fails (exit $LAST_EXIT)" "$([ $LAST_EXIT -ne 0 ] && echo 1 || echo 0)"

  # 7. Purchase with inconsistent granted amounts vs pack mapping: migration fails.
  db="precond_${flavor}_badpackmapping"
  $fresh_fn "$db"
  insert_batch "$db" "d0000000-0000-0000-0000-000000000006" "purchase" "'pi_badpack_001'" "'cs_badpack_001'" "'price_badpack_001'" "'small'" 1000 "'eur'" 1 "now() - interval '1 day'" 999 "now() + interval '89 days'" > /dev/null
  run_migration "$db" "$file"
  assert "[$flavor] purchase pack_id=small but checks_granted=999 (mismatched mapping) -> migration fails (exit $LAST_EXIT)" "$([ $LAST_EXIT -ne 0 ] && echo 1 || echo 0)"
}

test_flavor "01" "$ROOT/01_production_migration.sql" fresh_db_01
test_flavor "02" "$ROOT/02_test_reconciliation.sql" fresh_db_02

log ""
log "############################################################"
log "SUMMARY: $PASS passed, $FAIL failed"
log "############################################################"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
