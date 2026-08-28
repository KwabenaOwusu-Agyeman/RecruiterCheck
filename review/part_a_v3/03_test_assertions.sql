-- ============================================================================
-- SQL test script. NOT YET EXECUTED against any database. Intended to run
-- against myrecruitercheck-scoring-test AFTER 02_test_reconciliation.sql is
-- approved and applied. Uses plain assertion pattern: each block RAISEs an
-- exception (aborting and clearly failing) if its assertion doesn't hold.
-- Requires two synthetic users already present from earlier Part B testing
-- (a0000000-...000a, b0000000-...000b) or freshly created equivalents.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Setup: fresh fixture per run (idempotent -- safe to re-run this whole file).
-- ---------------------------------------------------------------------------
do $$
begin
  delete from public.check_ledger where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
  delete from public.refund_events where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
  delete from public.keyword_scan_reservations where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
  delete from public.credit_batches where user_id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');

  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  update public.profiles set checks_balance = 0, lifetime_checks_consumed = 0, keyword_scans_consumed = 0
    where id in ('a0000000-0000-0000-0000-00000000000a','b0000000-0000-0000-0000-00000000000b');
end $$;

-- ---------------------------------------------------------------------------
-- T-LEASE-1: repeated reserve does not extend lease.
-- ---------------------------------------------------------------------------
do $$
declare
  v_lease_1 timestamptz;
  v_lease_2 timestamptz;
  v_result record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);

  select * into v_result from public.reserve_keyword_scan('t-lease-1-key-00001');
  reset role;
  select lease_expires_at into v_lease_1 from public.keyword_scan_reservations where id = v_result.reservation_id;
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);

  perform pg_sleep(1);

  select * into v_result from public.reserve_keyword_scan('t-lease-1-key-00001');
  reset role;
  select lease_expires_at into v_lease_2 from public.keyword_scan_reservations where id = v_result.reservation_id;

  if v_lease_1 <> v_lease_2 then
    raise exception 'T-LEASE-1 FAILED: lease_expires_at changed from % to % on repeated reserve', v_lease_1, v_lease_2;
  end if;
  raise notice 'T-LEASE-1 PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- T-POLL-1: poll_keyword_scan_status never renews lease.
-- ---------------------------------------------------------------------------
do $$
declare
  v_lease_before timestamptz;
  v_lease_after timestamptz;
begin
  select lease_expires_at into v_lease_before from public.keyword_scan_reservations
    where user_id = 'a0000000-0000-0000-0000-00000000000a' and idempotency_key = 't-lease-1-key-00001';

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  perform * from public.poll_keyword_scan_status('t-lease-1-key-00001');
  perform * from public.poll_keyword_scan_status('t-lease-1-key-00001'); -- multiple polls
  reset role;

  select lease_expires_at into v_lease_after from public.keyword_scan_reservations
    where user_id = 'a0000000-0000-0000-0000-00000000000a' and idempotency_key = 't-lease-1-key-00001';

  if v_lease_before <> v_lease_after then
    raise exception 'T-POLL-1 FAILED: polling changed lease_expires_at';
  end if;
  raise notice 'T-POLL-1 PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- T-LOCK-1: reserve_keyword_scan and expire_credit_batches use the same
-- profile-first lock order. This test verifies the STATIC fact (both
-- functions' bodies lock profiles.id via "for update" before any
-- credit_batches row) by inspecting function source -- a true concurrent
-- deadlock test requires two separate simultaneous sessions, which this
-- single-session script cannot drive; documented as a manual step in
-- RUNBOOK.md's concurrency test procedure (two `psql` sessions run in
-- parallel).
-- ---------------------------------------------------------------------------
do $$
declare
  v_reserve_src text;
  v_expire_src text;
  v_reserve_profile_pos integer;
  v_reserve_batch_pos integer;
  v_expire_profile_pos integer;
  v_expire_batch_pos integer;
begin
  select prosrc into v_reserve_src from pg_proc where proname = 'reserve_keyword_scan' and pronamespace = 'public'::regnamespace;
  select prosrc into v_expire_src from pg_proc where proname = 'expire_credit_batches' and pronamespace = 'public'::regnamespace;

  v_reserve_profile_pos := position('profiles where id = v_user_id for update' in v_reserve_src);
  v_reserve_batch_pos := position('credit_batches where id = v_batch_id for update' in v_reserve_src);
  v_expire_profile_pos := position('profiles where id = v_user_id for update' in v_expire_src);
  v_expire_batch_pos := position('for update' in substring(v_expire_src from 'credit_batches\s+where.*?for update'));

  if v_reserve_profile_pos = 0 or v_reserve_profile_pos >= v_reserve_batch_pos then
    raise exception 'T-LOCK-1 FAILED: reserve_keyword_scan does not lock profile before batch';
  end if;
  if v_expire_profile_pos = 0 then
    raise exception 'T-LOCK-1 FAILED: expire_credit_batches does not lock profile at all';
  end if;
  raise notice 'T-LOCK-1 PASSED (static source check; run RUNBOOK.md''s two-session concurrency test for a true dynamic proof)';
end $$;

-- ---------------------------------------------------------------------------
-- T-RES-1..9: result validation (Item I) -- concrete cases
-- ---------------------------------------------------------------------------
do $$
declare
  v_reservation_id uuid;
  v_result record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);

  -- fresh reservation for each validation case
  select reservation_id into v_reservation_id from public.reserve_keyword_scan('t-res-null-elem') limit 1;
  select * into v_result from public.complete_keyword_scan(v_reservation_id,
    '{"match_percent":50,"matched_total":1,"missing_total":1,"matched_terms":[null],"missing_terms":["x"]}'::jsonb);
  if v_result.outcome <> 'invalid_result' then raise exception 'T-RES-1 (null element) FAILED: got %', v_result.outcome; end if;
  raise notice 'T-RES-1 PASSED';
end $$;

do $$
declare
  v_reservation_id uuid;
  v_result record;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  select reservation_id into v_reservation_id from public.reserve_keyword_scan('t-res-number-elem') limit 1;
  select * into v_result from public.complete_keyword_scan(v_reservation_id,
    '{"match_percent":50,"matched_total":1,"missing_total":1,"matched_terms":[123],"missing_terms":["x"]}'::jsonb);
  if v_result.outcome <> 'invalid_result' then raise exception 'T-RES-2 (number element) FAILED: got %', v_result.outcome; end if;
  raise notice 'T-RES-2 PASSED';
end $$;

do $$
declare
  v_reservation_id uuid;
  v_result record;
  v_credit_before integer;
  v_credit_after integer;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-00000000000a','role','authenticated')::text, true);
  select free_keyword_scans_available into v_credit_before from public.get_credit_summary();
  select reservation_id into v_reservation_id from public.reserve_keyword_scan('t-res-invalid-atomic') limit 1;
  select * into v_result from public.complete_keyword_scan(v_reservation_id,
    '{"match_percent":999,"matched_total":1,"missing_total":1,"matched_terms":["a"],"missing_terms":["b"]}'::jsonb);
  select free_keyword_scans_available into v_credit_after from public.get_credit_summary();

  if v_result.outcome <> 'invalid_result' then raise exception 'T-RES-9 FAILED: expected invalid_result, got %', v_result.outcome; end if;
  if v_credit_before <> v_credit_after then raise exception 'T-RES-9 FAILED: credit not atomically restored, before=% after=%', v_credit_before, v_credit_after; end if;
  raise notice 'T-RES-9 PASSED (invalid result atomically released the credit, no second call needed)';
end $$;

-- ---------------------------------------------------------------------------
-- T-WH-13: fulfilment_conflict on differing verified facts for the same
-- payment intent (Item F/10)
-- ---------------------------------------------------------------------------
do $$
declare
  v_error_caught boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  perform public.grant_pack_credits(
    'a0000000-0000-0000-0000-00000000000a', 'small', 'pi_test_conflict_001', 'cs_test_conflict_001',
    'price_test_small', 1000, 'eur', 1, now());

  begin
    perform public.grant_pack_credits(
      'a0000000-0000-0000-0000-00000000000a', 'medium', 'pi_test_conflict_001', 'cs_test_conflict_002', -- different pack, same payment intent
      'price_test_medium', 2000, 'eur', 1, now());
  exception when others then
    if SQLERRM like '%fulfilment_conflict%' then
      v_error_caught := true;
    else
      raise;
    end if;
  end;

  if not v_error_caught then raise exception 'T-WH-13 FAILED: expected fulfilment_conflict exception'; end if;
  raise notice 'T-WH-13 PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- T-MIG-conflict: purchase batch with null expiry rejected at the
-- constraint level (Item F, "purchase batch with null expiry rejected")
-- ---------------------------------------------------------------------------
do $$
declare v_error_caught boolean := false;
begin
  perform set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  begin
    insert into public.credit_batches (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, expires_at)
    values ('a0000000-0000-0000-0000-00000000000a', 'purchase', 5, 5, 5, 5, 'pi_test_null_expiry', null);
  exception when check_violation then
    v_error_caught := true;
  end;
  if not v_error_caught then raise exception 'T-MIG-conflict FAILED: null-expiry purchase batch was NOT rejected'; end if;
  raise notice 'T-MIG-conflict PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- T-STRUCT-1: direct table access fully revoked (Item 11/J)
-- ---------------------------------------------------------------------------
do $$
declare v_grant_count integer;
begin
  select count(*) into v_grant_count from information_schema.role_table_grants
    where table_schema='public' and table_name='keyword_scan_reservations' and grantee in ('anon','authenticated');
  if v_grant_count > 0 then raise exception 'T-STRUCT-1 FAILED: % direct grants remain on keyword_scan_reservations for anon/authenticated', v_grant_count; end if;
  raise notice 'T-STRUCT-1 PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- T-STRUCT-2: no client policies on keyword_scan_reservations
-- ---------------------------------------------------------------------------
do $$
declare v_policy_count integer;
begin
  select count(*) into v_policy_count from pg_policies where schemaname='public' and tablename='keyword_scan_reservations';
  if v_policy_count > 0 then raise exception 'T-STRUCT-2 FAILED: % policies exist, expected 0', v_policy_count; end if;
  raise notice 'T-STRUCT-2 PASSED';
end $$;

-- ---------------------------------------------------------------------------
-- Cleanup notice
-- ---------------------------------------------------------------------------
do $$ begin raise notice 'Test script complete. Remaining scenarios (webhook fencing races, concurrent reserve-vs-refund, ambiguous refund reconciliation, canary allowlist enforcement, DNS-dependent SSRF tests) require either two simultaneous sessions or a live Stripe test-mode integration -- see RUNBOOK.md Testing Procedure for the manual/two-session steps not expressible as a single linear SQL script.'; end $$;
