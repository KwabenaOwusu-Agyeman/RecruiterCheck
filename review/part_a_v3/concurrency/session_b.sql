-- Session B. Run alongside session_a.sql in a separate connection, per the
-- pause points marked there.

-- ---------------------------------------------------------------------------
-- Scenario 1: attempt expire_credit_batches() while Session A holds the
-- profile lock. EXPECTED: this blocks (hangs) until Session A commits/rolls
-- back -- it must NOT deadlock, error, or proceed early.
-- ---------------------------------------------------------------------------
select public.expire_credit_batches();
-- If this returns immediately without Session A having committed yet,
-- the lock order test has FAILED.

-- ---------------------------------------------------------------------------
-- Scenario 2: attempt reserve_refund on the same batch Session A is
-- holding locked. EXPECTED: blocks until Session A commits, then either
-- succeeds (if Session A's transaction released the batch cleanly) or
-- reflects Session A's actual final state correctly -- never a torn read.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
select id from public.credit_batches where stripe_payment_intent_id = 'pi_concurrency_test_001' \gset
select * from public.reserve_refund(:'id');
commit;

-- ---------------------------------------------------------------------------
-- Scenario 3: concurrent reserve for the final free credit -- fire
-- alongside Session A's Scenario 3, using a DIFFERENT idempotency key.
-- EXPECTED: exactly one of A/B gets 'reserved', the other gets 'no_credits'.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
select * from public.reserve_keyword_scan('concurrency-final-credit-B');

-- ---------------------------------------------------------------------------
-- Scenario 4: while Session A holds the reservation row lock (simulating
-- mid-completion), backdate its lease and run the reconciler. EXPECTED:
-- the reconciler's "for update skip locked" causes it to SKIP this row --
-- reconciled_count for this row is 0 this pass. Session A's subsequent
-- complete_keyword_scan then succeeds normally afterward.
-- ---------------------------------------------------------------------------
update public.keyword_scan_reservations
  set lease_expires_at = now() - interval '1 minute'
  where idempotency_key = 'concurrency-reconcile-vs-complete';
select * from public.reconcile_abandoned_keyword_scan_reservations();
-- Confirm the row is still 'reserved' (not 'released') -- it was skipped:
select status from public.keyword_scan_reservations where idempotency_key = 'concurrency-reconcile-vs-complete';

-- ---------------------------------------------------------------------------
-- Scenario 5: backdate the lease on Session A's claimed webhook event and
-- reclaim it as a "second worker".
-- ---------------------------------------------------------------------------
update public.stripe_webhook_events set lease_expires_at = now() - interval '1 minute' where id = 'evt_concurrency_test_001';
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select * from public.claim_stripe_webhook_event('evt_concurrency_test_001', 'checkout.session.completed');
-- Note this NEW claim_token, then finalize it as this worker:
-- select * from public.complete_stripe_webhook_event('evt_concurrency_test_001', '<NEW TOKEN HERE>');
-- Expected: outcome = 'completed'. Then Session A's attempt with the OLD
-- token (session_a.sql) must return 'stale_claim'.
