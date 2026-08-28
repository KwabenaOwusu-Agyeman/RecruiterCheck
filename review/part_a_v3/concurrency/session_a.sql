-- Session A. Run against the same database as session_b.sql, in a separate
-- concurrent connection. Run each numbered block in order, pausing where
-- marked -- do not run the whole file at once.

-- ---------------------------------------------------------------------------
-- Scenario 1: reservation vs. expiry, same user. Holds the profile lock
-- reserve_keyword_scan would hold, mid-transaction.
-- ---------------------------------------------------------------------------
begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
select 1 from public.profiles where id = 'a0000000-0000-0000-0000-00000000000a' for update;
-- >>> PAUSE HERE. Switch to session_b.sql Scenario 1. Confirm it blocks. <<<
-- Then resume:
commit;

-- ---------------------------------------------------------------------------
-- Scenario 2: reservation vs. refund reserve, same batch. Requires a
-- purchase batch to exist for user A first -- set one up:
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
insert into public.credit_batches (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, expires_at)
values ('a0000000-0000-0000-0000-00000000000a', 'purchase', 5, 5, 5, 5, 'pi_concurrency_test_001', now() + interval '90 days')
on conflict (stripe_payment_intent_id) do nothing;

begin;
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
select id from public.credit_batches where stripe_payment_intent_id = 'pi_concurrency_test_001' for update;
-- >>> PAUSE HERE. Switch to session_b.sql Scenario 2. Confirm it blocks. <<<
commit;

-- ---------------------------------------------------------------------------
-- Scenario 3: concurrent reserve for the final free credit. Run this AT
-- THE SAME TIME as session_b.sql Scenario 3 (both fire immediately, no
-- pause -- this tests true concurrency, not sequenced blocking).
-- Precondition: user A has 0 free credits already used except the last one
-- (run the reset in verification.sql first if needed).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
select * from public.reserve_keyword_scan('concurrency-final-credit-A');

-- ---------------------------------------------------------------------------
-- Scenario 4: reconciler vs. complete. Reserve, then hold the row lock as
-- if mid-completion.
-- ---------------------------------------------------------------------------
select * from public.reserve_keyword_scan('concurrency-reconcile-vs-complete');
begin;
select id, reservation_id from public.keyword_scan_reservations where idempotency_key = 'concurrency-reconcile-vs-complete' \gset
select * from public.keyword_scan_reservations where id = :'id' for update;
-- >>> PAUSE HERE. In session_b.sql Scenario 4, backdate the lease and run
-- the reconciler -- confirm it SKIPS this row (skip locked). <<<
commit;
-- Now complete it normally:
select * from public.complete_keyword_scan(:'id', '{"match_percent":50,"matched_total":1,"missing_total":1,"matched_terms":["python"],"missing_terms":["go"]}'::jsonb);

-- ---------------------------------------------------------------------------
-- Scenario 5: stale webhook-worker fencing.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
select * from public.claim_stripe_webhook_event('evt_concurrency_test_001', 'checkout.session.completed');
-- Note the returned claim_token. Do NOT call complete_stripe_webhook_event yet.
-- >>> PAUSE HERE. In session_b.sql Scenario 5, backdate the lease and reclaim. <<<
-- Then attempt completion with the OLD token (paste it below):
-- select * from public.complete_stripe_webhook_event('evt_concurrency_test_001', '<OLD TOKEN HERE>');
-- Expected: outcome = 'stale_claim'
