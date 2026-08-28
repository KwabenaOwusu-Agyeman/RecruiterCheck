-- Run after completing session_a.sql / session_b.sql to check final state
-- and reset fixtures for a re-run.

-- Scenario 3 result check: exactly one of the two keys should be 'reserved'.
select idempotency_key, status, credit_source
from public.keyword_scan_reservations
where idempotency_key in ('concurrency-final-credit-A', 'concurrency-final-credit-B');
-- PASS condition: exactly one row has status='reserved', the other does
-- not exist at all (its reserve call returned 'no_credits', which never
-- inserts a row).

-- Scenario 4 result check.
select idempotency_key, status from public.keyword_scan_reservations
where idempotency_key = 'concurrency-reconcile-vs-complete';
-- PASS condition: status = 'completed' (Session A's complete_keyword_scan
-- succeeded after the reconciler correctly skipped it).

-- Scenario 5 result check.
select id, status, attempt_count from public.stripe_webhook_events where id = 'evt_concurrency_test_001';
-- PASS condition: status = 'completed', attempt_count = 2 (original claim +
-- one reclaim).

-- Reset for re-run:
delete from public.keyword_scan_reservations where idempotency_key like 'concurrency-%';
delete from public.stripe_webhook_events where id = 'evt_concurrency_test_001';
delete from public.credit_batches where stripe_payment_intent_id = 'pi_concurrency_test_001';
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
update public.profiles set checks_balance = 0, keyword_scans_consumed = 0 where id = 'a0000000-0000-0000-0000-00000000000a';
