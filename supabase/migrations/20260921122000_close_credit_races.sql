-- ============================================================================
-- Close two credit races found in the 2026-09-21 audit. Reproduced on a
-- local replay of every migration; each function body below is the current
-- definition with only the marked lines changed.
--
-- 1. Refund versus a running check. reserve_refund only required the pack
--    to be fully unused, and complete_check_analysis did not look at
--    refund_status. A customer who started a check and asked for a refund
--    while it ran got the full refund and, if completion won the race, kept
--    the check paid for from the refunded pack. reserve_refund now refuses
--    while a check is processing (outcome 'check_in_progress', handled by
--    request-refund), and completion spends only from active batches.
--
-- 2. Expired or refunding credit at the start of a check.
--    reserve_check_analysis tested profiles.checks_balance, which still
--    counts a batch until the nightly expiry job runs, while
--    complete_check_analysis spends only unexpired credit. The model then ran
--    for a check that could not complete. Reservation now applies the same
--    rule as completion. Dormant until the first purchased packs expire.
--
-- Grants are unchanged: create or replace keeps them.
--
-- NOT APPLIED to production. Credits: Level 3, needs founder approval for
-- supabase db push.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.complete_check_analysis(p_check_id uuid, p_user_id uuid, p_score integer, p_detected_language text, p_job_title text DEFAULT NULL::text, p_company_name text DEFAULT NULL::text, p_experience_score integer DEFAULT NULL::integer, p_skills_score integer DEFAULT NULL::integer, p_uvp_score integer DEFAULT NULL::integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status check_status;
  v_lifetime_consumed integer;
  v_free_limit constant integer := 1;
  v_batch_id uuid;
  v_pack_id text;
begin
  perform 1 from profiles where id = p_user_id for update;

  select status into v_status from checks where id = p_check_id and user_id = p_user_id;
  if v_status is null then
    raise exception 'check_not_found';
  end if;

  if v_status = 'completed' then
    return;
  end if;

  select lifetime_checks_consumed into v_lifetime_consumed from profiles where id = p_user_id;

  if v_lifetime_consumed < v_free_limit then
    update checks
      set status = 'completed',
          interview_probability_score = p_score,
          detected_language = p_detected_language,
          job_title = coalesce(job_title, p_job_title),
          company_name = coalesce(company_name, p_company_name),
          experience_score = p_experience_score,
          skills_score = p_skills_score,
          uvp_score = p_uvp_score,
          error_message = null,
          funding_pack_id = null
      where id = p_check_id;

    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
    return;
  end if;

  select id, pack_id into v_batch_id, v_pack_id
    from credit_batches
    where user_id = p_user_id
      and checks_remaining > 0
      and refund_status = 'active'
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last
    limit 1
    for update skip locked;

  if v_batch_id is null then
    raise exception 'no_checks_balance';
  end if;

  update checks
    set status = 'completed',
        interview_probability_score = p_score,
        detected_language = p_detected_language,
        job_title = coalesce(job_title, p_job_title),
        company_name = coalesce(company_name, p_company_name),
        experience_score = p_experience_score,
        skills_score = p_skills_score,
        uvp_score = p_uvp_score,
        error_message = null,
        funding_pack_id = v_pack_id
    where id = p_check_id;

  update credit_batches set checks_remaining = checks_remaining - 1 where id = v_batch_id;
  update profiles set checks_balance = checks_balance - 1 where id = p_user_id;

  insert into check_ledger (user_id, batch_id, entry_type, amount, related_check_id)
  values (p_user_id, v_batch_id, 'used', -1, p_check_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_check_analysis(p_check_id uuid, p_user_id uuid)
 RETURNS TABLE(allowed boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_status check_status;
  v_free_limit constant integer := 1;
  v_stale_after constant interval := interval '10 minutes';
  v_lifetime_consumed integer;
  v_checks_balance integer;
  v_processing_count integer;
  v_available integer;
begin
  perform 1 from profiles where id = p_user_id for update;

  select lifetime_checks_consumed, checks_balance
    into v_lifetime_consumed, v_checks_balance
    from profiles where id = p_user_id;

  if v_lifetime_consumed is null then
    return query select false, 'profile_not_found';
    return;
  end if;

  select status into v_status from checks where id = p_check_id and user_id = p_user_id;
  if v_status is null then
    return query select false, 'not_found';
    return;
  end if;
  if v_status = 'processing' then
    return query select false, 'already_processing';
    return;
  end if;
  if v_status = 'completed' then
    return query select false, 'already_completed';
    return;
  end if;

  select count(*) into v_processing_count
    from checks
    where user_id = p_user_id
      and status = 'processing'
      and updated_at >= now() - v_stale_after;

  if v_processing_count > 0 then
    return query select false, 'already_processing';
    return;
  end if;

  -- The credit complete_check_analysis will actually spend: an active,
  -- unexpired batch with checks left. profiles.checks_balance still counts a
  -- batch between its expiry and the nightly expire_credit_batches run, and a
  -- pack that is being refunded, so reserving on it let the model run for a
  -- check that could then never complete.
  select coalesce(sum(checks_remaining), 0) into v_available
    from credit_batches
    where user_id = p_user_id
      and checks_remaining > 0
      and refund_status = 'active'
      and (expires_at is null or expires_at > now());

  if v_lifetime_consumed < v_free_limit then
    -- free lifetime check still available, always allowed regardless of balance
    null;
  elsif v_checks_balance <= 0 or v_available <= 0 then
    return query select false, 'no_checks_balance';
    return;
  end if;

  update checks set status = 'processing', error_message = null where id = p_check_id;
  return query select true, null::text;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reserve_refund(p_batch_id uuid)
 RETURNS TABLE(outcome text, batch_id uuid, checks_granted integer, keyword_scans_granted integer, stripe_payment_intent_id text, refund_event_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_preread public.credit_batches%rowtype;
  v_batch public.credit_batches%rowtype;
  v_guarantee_window constant interval := interval '7 days';
  v_active_reservations integer;
  v_refund_event_id uuid;
  v_next_attempt integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_preread from public.credit_batches where id = p_batch_id and user_id = v_user_id;
  if not found then
    return query select 'batch_not_found'::text, null::uuid, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  perform 1 from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  select * into v_batch from public.credit_batches where id = p_batch_id and user_id = v_user_id for update;

  if v_batch.refund_status <> 'active' then
    return query select ('already_' || v_batch.refund_status)::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;
  if v_batch.checks_remaining <> v_batch.checks_granted or v_batch.keyword_scans_remaining <> v_batch.keyword_scans_granted then
    return query select 'already_used'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;
  if now() - v_batch.granted_at > v_guarantee_window then
    return query select 'window_expired'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  select count(*) into v_active_reservations from public.keyword_scan_reservations where keyword_scan_reservations.batch_id = p_batch_id and status = 'reserved';
  if v_active_reservations > 0 then
    return query select 'active_reservation_exists'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  -- A check that is still running may yet be paid for from this pack, which
  -- would leave the customer with a used check and a full refund.
  if exists (
    select 1 from public.checks c
    where c.user_id = v_user_id
      and c.status = 'processing'
      and c.updated_at >= now() - interval '15 minutes'
  ) then
    return query select 'check_in_progress'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  update public.credit_batches set refund_status = 'refund_pending' where id = p_batch_id;

  select coalesce(max(attempt_number), 0) + 1 into v_next_attempt from public.refund_events where refund_events.batch_id = p_batch_id;

  insert into public.refund_events (batch_id, user_id, status, attempt_number)
  values (p_batch_id, v_user_id, 'pending', v_next_attempt)
  returning id into v_refund_event_id;

  return query select 'reserved'::text, v_batch.id, v_batch.checks_granted, v_batch.keyword_scans_granted, v_batch.stripe_payment_intent_id, v_refund_event_id;
end;
$function$;

do $$
begin
  if has_function_privilege('anon', 'public.reserve_refund(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.reserve_check_analysis(uuid, uuid)', 'EXECUTE') then
    raise exception 'a credit function gained a client grant';
  end if;
end $$;
