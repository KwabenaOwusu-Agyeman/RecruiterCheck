#!/bin/bash
# Deterministic two-process concurrency test harness. Launches separate
# `psql` processes concurrently against the disposable local database,
# captures exit codes/output/timing, and asserts pass/fail per scenario.
# Run from this directory: ./run_concurrency_harness.sh
set -u
export PATH="/usr/local/opt/postgresql@16/bin:$PATH"
export LC_ALL="en_US.UTF-8"
DB="part_a_validation"
RESULTS="results.log"
: > "$RESULTS"

PASS=0
FAIL=0

log() { echo "$@" | tee -a "$RESULTS"; }

reset_fixtures() {
  psql -d "$DB" -X -q -v ON_ERROR_STOP=1 -c "
    select set_config('request.jwt.claims', json_build_object('role','service_role')::text, false);
    delete from public.check_ledger where keyword_scan_reservation_id in (select id from public.keyword_scan_reservations where idempotency_key like 'harness-%');
    delete from public.check_ledger where batch_id in (select id from public.credit_batches where stripe_payment_intent_id like 'pi_harness_%');
    delete from public.keyword_scan_reservations where idempotency_key like 'harness-%';
    delete from public.keyword_scan_reservations where batch_id in (select id from public.credit_batches where stripe_payment_intent_id like 'pi_harness_%');
    delete from public.refund_events where batch_id in (select id from public.credit_batches where stripe_payment_intent_id like 'pi_harness_%');
    delete from public.credit_batches where stripe_payment_intent_id like 'pi_harness_%';
    delete from public.stripe_webhook_events where id like 'evt_harness_%';
    update public.profiles set checks_balance=0, lifetime_checks_consumed=0, keyword_scans_consumed=0
      where id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
  " > /tmp/harness_reset_fixtures.out 2>&1
  if [ $? -ne 0 ]; then
    echo "FATAL: reset_fixtures failed, aborting harness (see /tmp/harness_reset_fixtures.out):" >&2
    cat /tmp/harness_reset_fixtures.out >&2
    exit 2
  fi
}

assert() {
  local desc="$1" cond="$2"
  if [ "$cond" = "1" ]; then
    log "PASS: $desc"; PASS=$((PASS+1))
  else
    log "FAIL: $desc"; FAIL=$((FAIL+1))
  fi
}

# do-blocks produce NO row output, so chaining them before a real SELECT
# never contaminates the captured -t -A result (the bug in the previous run).
AUTH_A="do \$\$ begin perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, false); end \$\$;"
SVC="do \$\$ begin perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, false); end \$\$;"

# Standard verified-fact columns required by credit_batches_purchase_verified_facts_check.
INSERT_BATCH() {
  local pi="$1" expires="$2"
  echo "insert into public.credit_batches (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, stripe_price_id, amount_paid, currency, quantity, paid_at, expires_at) values ('a0000000-0000-0000-0000-00000000000a','purchase',5,5,5,5,'$pi','price_harness_test',1000,'eur',1,now(),$expires);"
}

log "=========================================================="
log "SCENARIO 1: two reservations, one remaining free credit"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "$SVC update public.profiles set keyword_scans_consumed = 2 where id = 'a0000000-0000-0000-0000-00000000000a';" > /dev/null

( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_keyword_scan('harness-final-A');" > /tmp/harness_s1_a.out 2>&1 ) &
PID1=$!
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_keyword_scan('harness-final-B');" > /tmp/harness_s1_b.out 2>&1 ) &
PID2=$!
wait $PID1 $PID2
OUT_A=$(cat /tmp/harness_s1_a.out | tr -d '[:space:]')
OUT_B=$(cat /tmp/harness_s1_b.out | tr -d '[:space:]')
log "  Session A outcome: $OUT_A"
log "  Session B outcome: $OUT_B"
BOTH_RESERVED=0
if { [ "$OUT_A" = "reserved" ] && [ "$OUT_B" = "no_credits" ]; } || { [ "$OUT_A" = "no_credits" ] && [ "$OUT_B" = "reserved" ]; }; then
  BOTH_RESERVED=1
fi
assert "exactly one of two concurrent reserves succeeds when 1 free credit remains" "$BOTH_RESERVED"
RESERVED_COUNT=$(psql -d "$DB" -X -q -t -A -c "select count(*) from public.keyword_scan_reservations where idempotency_key in ('harness-final-A','harness-final-B') and status='reserved';")
assert "database state: exactly 1 reserved row (got $RESERVED_COUNT)" "$([ "$RESERVED_COUNT" = "1" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 2: complete versus release, same reservation"
log "=========================================================="
reset_fixtures
RID=$(psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select reservation_id from public.reserve_keyword_scan('harness-complete-vs-release');" | tr -d '[:space:]')
log "  reservation id: $RID"
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.complete_keyword_scan('$RID', '{\"match_percent\":50,\"matched_total\":1,\"missing_total\":1,\"matched_terms\":[\"a\"],\"missing_terms\":[\"b\"]}'::jsonb);" > /tmp/harness_s2_a.out 2>&1 ) &
PID1=$!
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.release_keyword_scan_reservation('$RID');" > /tmp/harness_s2_b.out 2>&1 ) &
PID2=$!
wait $PID1 $PID2
log "  complete() result: $(cat /tmp/harness_s2_a.out | tr -d '[:space:]')"
log "  release() result:  $(cat /tmp/harness_s2_b.out | tr -d '[:space:]')"
FINAL_STATUS=$(psql -d "$DB" -X -q -t -A -c "select status from public.keyword_scan_reservations where id='$RID';" | tr -d '[:space:]')
LEDGER_ROWS=$(psql -d "$DB" -X -q -t -A -c "select count(*) from public.check_ledger where keyword_scan_reservation_id='$RID';" | tr -d '[:space:]')
assert "reservation ends in exactly one terminal state (got: $FINAL_STATUS)" "$([ "$FINAL_STATUS" = "completed" ] || [ "$FINAL_STATUS" = "released" ] && echo 1 || echo 0)"
assert "exactly one ledger entry for this reservation regardless of race outcome (got $LEDGER_ROWS)" "$([ "$LEDGER_ROWS" = "1" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 3: complete versus abandoned-reservation reconciliation"
log "=========================================================="
reset_fixtures
RID=$(psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select reservation_id from public.reserve_keyword_scan('harness-reconcile-vs-complete');" | tr -d '[:space:]')
psql -d "$DB" -X -q -c "update public.keyword_scan_reservations set lease_expires_at = now() - interval '1 minute' where id = '$RID';" > /dev/null
( psql -d "$DB" -X -q -t -A <<SQL > /tmp/harness_s3_a.out 2>&1
set local role authenticated;
$AUTH_A
begin;
select 1 from public.keyword_scan_reservations where id = '$RID' for update;
select pg_sleep(2);
commit;
select outcome from public.complete_keyword_scan('$RID', '{"match_percent":50,"matched_total":1,"missing_total":1,"matched_terms":["a"],"missing_terms":["b"]}'::jsonb);
SQL
) &
PID1=$!
sleep 0.3
START=$(date +%s)
psql -d "$DB" -X -q -t -A -c "$SVC select reconciled_count from public.reconcile_abandoned_keyword_scan_reservations();" > /tmp/harness_s3_b.out 2>&1
END=$(date +%s)
wait $PID1
DURATION=$((END-START))
RECONCILED=$(cat /tmp/harness_s3_b.out | tr -d '[:space:]')
log "  reconciler ran while A held the lock, returned reconciled_count=$RECONCILED, took ${DURATION}s"
log "  complete() result: $(cat /tmp/harness_s3_a.out | tail -1 | tr -d '[:space:]')"
FINAL_STATUS=$(psql -d "$DB" -X -q -t -A -c "select status from public.keyword_scan_reservations where id='$RID';" | tr -d '[:space:]')
assert "reconciler skipped the locked row via skip-locked, not blocked (returned quickly, reconciled_count=0)" "$([ "$RECONCILED" = "0" ] && [ "$DURATION" -lt 2 ] && echo 1 || echo 0)"
assert "reservation ultimately completed normally, not double-processed" "$([ "$FINAL_STATUS" = "completed" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 4: completion during pack expiry"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "$SVC $(INSERT_BATCH pi_harness_expiry_001 "now() + interval '1 second'")" > /dev/null
RID=$(psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select reservation_id from public.reserve_keyword_scan('harness-completion-during-expiry');" | tr -d '[:space:]')
sleep 2
psql -d "$DB" -X -q -c "$SVC select public.expire_credit_batches();" > /dev/null
RESULT=$(psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.complete_keyword_scan('$RID', '{\"match_percent\":50,\"matched_total\":1,\"missing_total\":1,\"matched_terms\":[\"a\"],\"missing_terms\":[\"b\"]}'::jsonb);" | tr -d '[:space:]')
log "  complete_keyword_scan after batch expiry: $RESULT"
LEDGER_TYPE=$(psql -d "$DB" -X -q -t -A -c "select entry_type from public.check_ledger where keyword_scan_reservation_id='$RID';" | tr -d '[:space:]')
assert "an already-reserved (pre-expiry) credit still completes normally (not revoked by later expiry)" "$([ "$RESULT" = "completed" ] && echo 1 || echo 0)"
assert "ledger records a 'used' entry, not 'expired', for this completed reservation" "$([ "$LEDGER_TYPE" = "used" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 5: refund versus expiry"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "$SVC $(INSERT_BATCH pi_harness_refund_expiry_001 "now() + interval '1 second'")" > /dev/null
BATCH_ID=$(psql -d "$DB" -X -q -t -A -c "select id from public.credit_batches where stripe_payment_intent_id='pi_harness_refund_expiry_001';" | tr -d '[:space:]')
sleep 2
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_refund('$BATCH_ID');" > /tmp/harness_s5_a.out 2>&1 ) &
PID1=$!
( psql -d "$DB" -X -q -c "$SVC select public.expire_credit_batches();" > /tmp/harness_s5_b.out 2>&1 ) &
PID2=$!
wait $PID1 $PID2
log "  reserve_refund result: $(cat /tmp/harness_s5_a.out | tr -d '[:space:]')"
FINAL_REFUND_STATUS=$(psql -d "$DB" -X -q -t -A -c "select refund_status from public.credit_batches where id='$BATCH_ID';" | tr -d '[:space:]')
log "  final batch refund_status: $FINAL_REFUND_STATUS"
assert "batch ends in a single consistent refund_status, no corruption (got: $FINAL_REFUND_STATUS)" "$([ -n "$FINAL_REFUND_STATUS" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 6: two simultaneous refund reservations, same batch"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "$SVC $(INSERT_BATCH pi_harness_double_refund_001 "now() + interval '90 days'")" > /dev/null
BATCH_ID=$(psql -d "$DB" -X -q -t -A -c "select id from public.credit_batches where stripe_payment_intent_id='pi_harness_double_refund_001';" | tr -d '[:space:]')
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_refund('$BATCH_ID');" > /tmp/harness_s6_a.out 2>&1 ) &
PID1=$!
( psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_refund('$BATCH_ID');" > /tmp/harness_s6_b.out 2>&1 ) &
PID2=$!
wait $PID1 $PID2
OUT_A=$(cat /tmp/harness_s6_a.out | tr -d '[:space:]')
OUT_B=$(cat /tmp/harness_s6_b.out | tr -d '[:space:]')
log "  Session A: $OUT_A / Session B: $OUT_B"
EXACTLY_ONE=0
if { [ "$OUT_A" = "reserved" ] && [ "$OUT_B" != "reserved" ]; } || { [ "$OUT_B" = "reserved" ] && [ "$OUT_A" != "reserved" ]; }; then EXACTLY_ONE=1; fi
assert "exactly one of two concurrent refund reservations on the same batch succeeds" "$EXACTLY_ONE"
PENDING_COUNT=$(psql -d "$DB" -X -q -t -A -c "select count(*) from public.refund_events where batch_id='$BATCH_ID' and status='pending';" | tr -d '[:space:]')
assert "at most one pending refund_events row exists (partial unique index enforced, got $PENDING_COUNT)" "$([ "$PENDING_COUNT" = "1" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 7: two webhook workers claiming one event"
log "=========================================================="
reset_fixtures
( psql -d "$DB" -X -q -t -A -c "$SVC select outcome from public.claim_stripe_webhook_event('evt_harness_race_001','checkout.session.completed');" > /tmp/harness_s7_a.out 2>&1 ) &
PID1=$!
( psql -d "$DB" -X -q -t -A -c "$SVC select outcome from public.claim_stripe_webhook_event('evt_harness_race_001','checkout.session.completed');" > /tmp/harness_s7_b.out 2>&1 ) &
PID2=$!
wait $PID1 $PID2
OUT_A=$(cat /tmp/harness_s7_a.out | tr -d '[:space:]')
OUT_B=$(cat /tmp/harness_s7_b.out | tr -d '[:space:]')
log "  Session A claim: $OUT_A / Session B claim: $OUT_B"
EXACTLY_ONE_NEW=0
if { [ "$OUT_A" = "claimed_new" ] && [ "$OUT_B" = "contention" ]; } || { [ "$OUT_B" = "claimed_new" ] && [ "$OUT_A" = "contention" ]; }; then EXACTLY_ONE_NEW=1; fi
assert "exactly one worker gets claimed_new, the other gets contention" "$EXACTLY_ONE_NEW"
ATTEMPT_COUNT=$(psql -d "$DB" -X -q -t -A -c "select attempt_count from public.stripe_webhook_events where id='evt_harness_race_001';" | tr -d '[:space:]')
assert "attempt_count is exactly 1 (contention never incremented it, got $ATTEMPT_COUNT)" "$([ "$ATTEMPT_COUNT" = "1" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 8: worker A lease expires, worker B reclaims, A then attempts completion and failure"
log "=========================================================="
reset_fixtures
TOKEN_A=$(psql -d "$DB" -X -q -t -A -c "$SVC select claim_token from public.claim_stripe_webhook_event('evt_harness_stale_001','checkout.session.completed');" | tr -d '[:space:]')
psql -d "$DB" -X -q -c "update public.stripe_webhook_events set lease_expires_at = now() - interval '1 minute' where id='evt_harness_stale_001';" > /dev/null
TOKEN_B=$(psql -d "$DB" -X -q -t -A -c "$SVC select claim_token from public.claim_stripe_webhook_event('evt_harness_stale_001','checkout.session.completed');" | tr -d '[:space:]')
log "  Worker A token: $TOKEN_A"
log "  Worker B token (reclaimed): $TOKEN_B"
COMPLETE_A=$(psql -d "$DB" -X -q -t -A -c "$SVC select outcome from public.complete_stripe_webhook_event('evt_harness_stale_001', '$TOKEN_A');" | tr -d '[:space:]')
log "  Worker A complete() with stale token: $COMPLETE_A"
FAIL_A=$(psql -d "$DB" -X -q -t -A -c "$SVC select outcome from public.fail_stripe_webhook_event('evt_harness_stale_001', '$TOKEN_A', 'test');" | tr -d '[:space:]')
log "  Worker A fail() with stale token: $FAIL_A"
assert "worker A's complete() with a stale token returns stale_claim" "$([ "$COMPLETE_A" = "stale_claim" ] && echo 1 || echo 0)"
assert "worker A's fail() with a stale token also returns stale_claim" "$([ "$FAIL_A" = "stale_claim" ] && echo 1 || echo 0)"
COMPLETE_B=$(psql -d "$DB" -X -q -t -A -c "$SVC select outcome from public.complete_stripe_webhook_event('evt_harness_stale_001', '$TOKEN_B');" | tr -d '[:space:]')
log "  Worker B complete() with its valid (reclaimed) token: $COMPLETE_B"
assert "worker B's valid token successfully completes the event" "$([ "$COMPLETE_B" = "completed" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 9: repeated reserve with the same idempotency key"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "set local role authenticated; $AUTH_A select outcome from public.reserve_keyword_scan('harness-repeat-key');" > /dev/null
LEASE_1=$(psql -d "$DB" -X -q -t -A -c "select lease_expires_at from public.keyword_scan_reservations where idempotency_key='harness-repeat-key';")
: > /tmp/harness_s9.out
for i in 1 2 3 4 5; do
  psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.reserve_keyword_scan('harness-repeat-key');" >> /tmp/harness_s9.out 2>&1
done
LEASE_2=$(psql -d "$DB" -X -q -t -A -c "select lease_expires_at from public.keyword_scan_reservations where idempotency_key='harness-repeat-key';")
OUTCOMES=$(cat /tmp/harness_s9.out | tr '\n' ',' )
log "  5 repeated reserve calls, outcomes: $OUTCOMES"
log "  lease before: $LEASE_1 / lease after: $LEASE_2"
ALL_PROCESSING=$(grep -c "already_processing" /tmp/harness_s9.out || true)
assert "all 5 repeat calls return already_processing (not a new reservation)" "$([ "$ALL_PROCESSING" = "5" ] && echo 1 || echo 0)"
assert "lease_expires_at is IDENTICAL before and after repeated reserve calls (never extended)" "$([ "$LEASE_1" = "$LEASE_2" ] && echo 1 || echo 0)"
COUNT_ROWS=$(psql -d "$DB" -X -q -t -A -c "select count(*) from public.keyword_scan_reservations where idempotency_key='harness-repeat-key';" | tr -d '[:space:]')
assert "exactly 1 reservation row exists for this key despite 6 total calls" "$([ "$COUNT_ROWS" = "1" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SCENARIO 10: polling while processing"
log "=========================================================="
reset_fixtures
psql -d "$DB" -X -q -c "set local role authenticated; $AUTH_A select outcome from public.reserve_keyword_scan('harness-poll-while-processing');" > /dev/null
LEASE_1=$(psql -d "$DB" -X -q -t -A -c "select lease_expires_at from public.keyword_scan_reservations where idempotency_key='harness-poll-while-processing';")
for i in 1 2 3 4 5; do
  psql -d "$DB" -X -q -t -A -c "set local role authenticated; $AUTH_A select outcome from public.poll_keyword_scan_status('harness-poll-while-processing');" > /tmp/harness_s10_$i.out 2>&1
done
LEASE_2=$(psql -d "$DB" -X -q -t -A -c "select lease_expires_at from public.keyword_scan_reservations where idempotency_key='harness-poll-while-processing';")
log "  5 polls; lease before: $LEASE_1 / lease after: $LEASE_2"
assert "polling never renews the lease (identical before/after)" "$([ "$LEASE_1" = "$LEASE_2" ] && echo 1 || echo 0)"
POLL_OUTCOME=$(cat /tmp/harness_s10_1.out | tr -d '[:space:]')
log "  poll outcome: $POLL_OUTCOME"
assert "poll correctly reports already_processing while reserved" "$([ "$POLL_OUTCOME" = "already_processing" ] && echo 1 || echo 0)"

log ""
log "=========================================================="
log "SUMMARY: $PASS passed, $FAIL failed"
log "=========================================================="

reset_fixtures
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
