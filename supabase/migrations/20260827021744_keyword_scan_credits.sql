-- ============================================================================
-- Keyword Scan credits: dual-credit-type support, reservation-time credit
-- allocation, ledger-only accounting (no duplicate balance on profiles).
--
-- STATUS: production candidate. NOT YET APPLIED ANYWHERE -- not to
-- production, not yet re-applied to myrecruitercheck-scoring-test (which
-- currently holds the PRIOR draft of this migration, including the
-- now-removed profiles.keyword_scan_balance column and the profile-writing
-- versions of reserve_keyword_scan/release_keyword_scan_reservation). This
-- file supersedes that draft; a corresponding follow-up migration will be
-- applied to the test project once this version is approved -- see the
-- accompanying review for the exact test-project follow-up statements
-- (drop keyword_scan_balance, replace the three changed functions, drop
-- restore_keyword_scan_credit).
-- ============================================================================

-- ---- credit_batches: same purchase row carries both credit types --------
alter table public.credit_batches
  add column if not exists keyword_scans_granted integer not null default 0
    check (keyword_scans_granted >= 0),
  add column if not exists keyword_scans_remaining integer not null default 0
    check (keyword_scans_remaining >= 0);

do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='credit_batches' and column_name='keyword_scans_remaining') then
    raise exception 'credit_batches.keyword_scans_remaining missing after migration';
  end if;
end $$;

create index if not exists credit_batches_user_expiry_ks_idx
  on public.credit_batches (user_id, expires_at nulls last)
  where keyword_scans_remaining > 0;

-- ---- check_ledger: credit_type + 'released' entry_type -------------------
alter table public.check_ledger add column if not exists credit_type text;
update public.check_ledger set credit_type = 'check' where credit_type is null;
alter table public.check_ledger alter column credit_type set not null;
alter table public.check_ledger alter column credit_type set default 'check';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.check_ledger'::regclass
      and conname = 'check_ledger_entry_type_check'
  ) then
    raise exception 'expected constraint check_ledger_entry_type_check not found -- schema drifted from what this migration assumes';
  end if;
end $$;

alter table public.check_ledger drop constraint check_ledger_entry_type_check;
alter table public.check_ledger add constraint check_ledger_entry_type_check
  check (entry_type = any (array['purchased','used','refunded','expired','manual_adjustment','released']));

alter table public.check_ledger drop constraint if exists check_ledger_credit_type_check;
alter table public.check_ledger add constraint check_ledger_credit_type_check
  check (credit_type in ('check', 'keyword_scan'));

-- ---- keyword_scan_reservations ---------------------------------------------
create table if not exists public.keyword_scan_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  credit_source text check (credit_source in ('free', 'paid')),
  batch_id uuid references public.credit_batches (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  unique (user_id, idempotency_key)
);

do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='keyword_scan_reservations' and column_name='result_expires_at')
    or not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='keyword_scan_reservations' and column_name='credit_source')
  then
    raise exception 'keyword_scan_reservations exists with an unexpected structure -- refusing to proceed';
  end if;
end $$;

create index if not exists keyword_scan_reservations_cleanup_idx
  on public.keyword_scan_reservations (result_expires_at) where result is not null;

alter table public.keyword_scan_reservations enable row level security;

drop policy if exists "Users can view own keyword scan reservations" on public.keyword_scan_reservations;
create policy "Users can view own keyword scan reservations"
  on public.keyword_scan_reservations for select using (auth.uid() = user_id);

comment on column public.profiles.keyword_scans_consumed is
  'Frozen, read-only legacy offset: free Keyword Scan usage recorded before the reservation-based system (keyword_scan_reservations) took over. No code writes this column after cutover -- see reserve_keyword_scan / get_credit_summary for the read-only, clamped usage.';

-- ============================================================================
-- reserve_keyword_scan: selects AND reserves the exact credit, atomically.
-- Never writes to public.profiles.
-- ============================================================================
create or replace function public.reserve_keyword_scan(p_idempotency_key text)
returns table(outcome text, reservation_id uuid, cached_result jsonb)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
  v_stale_after constant interval := interval '2 minutes';
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
  v_batch_id uuid;
  v_credit_source text;
  v_reusing_row boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then
    raise exception 'invalid_idempotency_key';
  end if;

  -- Lock-only mutex; profiles is never UPDATEd here. Serializes concurrent
  -- reserve calls for the same user so two simultaneous free-credit
  -- reservations can't both read a stale "used" count.
  perform 1 from public.profiles where id = v_user_id for update;

  select * into v_row
    from public.keyword_scan_reservations
    where user_id = v_user_id and idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_row.status = 'completed' then
      if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
        return query select 'replay_result'::text, v_row.id, v_row.result;
      else
        return query select 'result_expired'::text, v_row.id, null::jsonb;
      end if;
      return;
    end if;

    if v_row.status = 'reserved' and v_row.created_at >= now() - v_stale_after then
      return query select 'already_processing'::text, v_row.id, null::jsonb;
      return;
    end if;

    v_reusing_row := true;

    if v_row.status = 'reserved' and v_row.credit_source = 'paid' and v_row.batch_id is not null then
      update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
        where id = v_row.batch_id and expires_at > now();
    end if;
  end if;

  select id into v_batch_id
    from public.credit_batches
    where user_id = v_user_id
      and keyword_scans_remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last
    limit 1
    for update;

  if v_batch_id is not null then
    v_credit_source := 'paid';
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining - 1 where id = v_batch_id;
  else
    select greatest(least(keyword_scans_consumed, v_free_limit), 0) into v_legacy_offset
      from public.profiles where id = v_user_id;

    select count(*) into v_new_free_used
      from public.keyword_scan_reservations
      where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');

    if greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0) > 0 then
      v_credit_source := 'free';
    else
      return query select 'no_credits'::text, null::uuid, null::jsonb;
      return;
    end if;
  end if;

  if v_reusing_row then
    update public.keyword_scan_reservations
      set status = 'reserved', credit_source = v_credit_source, batch_id = v_batch_id,
          created_at = now(), completed_at = null, result = null, result_expires_at = null
      where id = v_row.id;
    return query select 'reserved'::text, v_row.id, null::jsonb;
  else
    insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id)
    values (v_user_id, p_idempotency_key, 'reserved', v_credit_source, v_batch_id)
    returning id into v_row.id;
    return query select 'reserved'::text, v_row.id, null::jsonb;
  end if;
end;
$function$;

revoke execute on function public.reserve_keyword_scan(text) from public, anon;
grant execute on function public.reserve_keyword_scan(text) to authenticated;

-- ============================================================================
-- complete_keyword_scan: uses ONLY the credit_source/batch_id already on
-- the reservation. No selection, no balance decrement, no profiles write.
-- ============================================================================
create or replace function public.complete_keyword_scan(p_reservation_id uuid, p_result jsonb)
returns table(outcome text, cached_result jsonb, result_expires_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
  v_validated jsonb;
  v_result_ttl constant interval := interval '24 hours';
  v_match_percent int; v_matched_total int; v_missing_total int;
  v_matched jsonb; v_missing jsonb; v_term text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then raise exception 'reservation_not_found'; end if;

  if v_row.status = 'completed' then
    return query select 'already_completed'::text, v_row.result, v_row.result_expires_at;
    return;
  end if;

  if v_row.status <> 'reserved' then
    raise exception 'reservation_not_reserved';
  end if;

  if v_row.credit_source is null then
    raise exception 'reservation_missing_credit_source: reservation_id=%, user_id=%', v_row.id, v_user_id;
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'invalid_result_payload'; end if;
  if exists (select key from jsonb_object_keys(p_result) as key
      where key not in ('match_percent','matched_total','missing_total','matched_terms','missing_terms'))
  then raise exception 'invalid_result_payload'; end if;
  if not (p_result ?& array['match_percent','matched_total','missing_total','matched_terms','missing_terms'])
  then raise exception 'invalid_result_payload'; end if;

  v_match_percent := (p_result->>'match_percent')::int;
  v_matched_total := (p_result->>'matched_total')::int;
  v_missing_total := (p_result->>'missing_total')::int;
  v_matched := p_result->'matched_terms';
  v_missing := p_result->'missing_terms';

  if v_match_percent is null or v_match_percent < 0 or v_match_percent > 100 then raise exception 'invalid_result_payload'; end if;
  if v_matched_total is null or v_matched_total < 0 or v_missing_total is null or v_missing_total < 0 then raise exception 'invalid_result_payload'; end if;
  if jsonb_typeof(v_matched) <> 'array' or jsonb_typeof(v_missing) <> 'array' then raise exception 'invalid_result_payload'; end if;
  if jsonb_array_length(v_matched) > 3 or jsonb_array_length(v_missing) > 3 then raise exception 'invalid_result_payload'; end if;

  for v_term in select jsonb_array_elements_text(v_matched) union all select jsonb_array_elements_text(v_missing)
  loop
    if v_term is null or length(trim(v_term)) = 0 or length(v_term) > 80 then raise exception 'invalid_result_payload'; end if;
    if v_term ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then raise exception 'invalid_result_payload'; end if;
    if regexp_replace(v_term, '\D', '', 'g') ~ '^[0-9]{7,}$' then raise exception 'invalid_result_payload'; end if;
  end loop;

  v_validated := jsonb_build_object(
    'match_percent', v_match_percent, 'matched_total', v_matched_total, 'missing_total', v_missing_total,
    'matched_terms', v_matched, 'missing_terms', v_missing
  );

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, note)
  values (v_user_id, v_row.batch_id, 'used', -1, 'keyword_scan', 'reservation ' || v_row.id || ' (' || v_row.credit_source || ')');

  update public.keyword_scan_reservations
    set status = 'completed', completed_at = now(), result = v_validated, result_expires_at = now() + v_result_ttl
    where id = v_row.id;

  return query select 'completed'::text, v_validated, (now() + v_result_ttl);
end;
$function$;

revoke execute on function public.complete_keyword_scan(uuid, jsonb) from public, anon;
grant execute on function public.complete_keyword_scan(uuid, jsonb) to authenticated;

-- ============================================================================
-- release_keyword_scan_reservation: idempotent, restores only the exact
-- recorded source/batch, never touches a completed row, never touches profiles.
-- ============================================================================
create or replace function public.release_keyword_scan_reservation(p_reservation_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then raise exception 'reservation_not_found'; end if;

  if v_row.status <> 'reserved' then
    return;
  end if;

  if v_row.credit_source = 'paid' and v_row.batch_id is not null then
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
      where id = v_row.batch_id and expires_at > now();
  end if;

  update public.keyword_scan_reservations set status = 'released' where id = p_reservation_id;
end;
$function$;

revoke execute on function public.release_keyword_scan_reservation(uuid) from public, anon;
grant execute on function public.release_keyword_scan_reservation(uuid) to authenticated;

-- ============================================================================
-- get_credit_summary
-- ============================================================================
create or replace function public.get_credit_summary()
returns table(
  valid_check_credits integer,
  valid_keyword_scan_credits integer,
  free_checks_remaining integer,
  free_keyword_scans_remaining integer,
  next_expiry timestamptz,
  next_expiry_check_count integer,
  next_expiry_keyword_scan_count integer
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select greatest(least(keyword_scans_consumed, v_free_limit), 0) into v_legacy_offset
    from public.profiles where id = v_user_id;

  select count(*) into v_new_free_used
    from public.keyword_scan_reservations
    where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');

  return query
  with valid_batches as (
    select b.expires_at, b.checks_remaining, b.keyword_scans_remaining
    from public.credit_batches b
    where b.user_id = v_user_id
      and (b.expires_at is null or b.expires_at > now())
      and (b.checks_remaining > 0 or b.keyword_scans_remaining > 0)
  ),
  next_batch as (
    select expires_at, checks_remaining, keyword_scans_remaining
    from valid_batches where expires_at is not null order by expires_at asc limit 1
  )
  select
    coalesce((select sum(checks_remaining) from valid_batches), 0)::int + greatest(1 - p.lifetime_checks_consumed, 0),
    coalesce((select sum(keyword_scans_remaining) from valid_batches), 0)::int
      + greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0),
    greatest(1 - p.lifetime_checks_consumed, 0),
    greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0),
    (select expires_at from next_batch),
    (select checks_remaining from next_batch),
    (select keyword_scans_remaining from next_batch)
  from public.profiles p
  where p.id = v_user_id;
end;
$function$;

revoke execute on function public.get_credit_summary() from public, anon;
grant execute on function public.get_credit_summary() to authenticated;

-- ============================================================================
-- grant_pack_credits: purchase fulfilment. Service-role only, no auth.uid().
-- Pack-derived amounts only -- no numeric amount is ever accepted as input.
-- ============================================================================
create or replace function public.grant_pack_credits(
  p_user_id uuid,
  p_pack_id text,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text,
  p_expires_at timestamptz
)
returns table(already_granted boolean, batch_id uuid, checks_granted integer, keyword_scans_granted integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_checks_amount integer;
  v_keyword_scans_amount integer;
  v_existing_batch_id uuid;
  v_new_batch_id uuid;
begin
  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then
    raise exception 'missing_fulfilment_identifier';
  end if;

  case p_pack_id
    when 'small' then v_checks_amount := 5; v_keyword_scans_amount := 5;
    when 'medium' then v_checks_amount := 15; v_keyword_scans_amount := 15;
    when 'large' then v_checks_amount := 40; v_keyword_scans_amount := 40;
    else raise exception 'unknown_pack_id: %', p_pack_id;
  end case;

  perform 1 from public.profiles where id = p_user_id for update;

  select id into v_existing_batch_id from public.credit_batches
    where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_existing_batch_id is not null then
    return query select true, v_existing_batch_id, v_checks_amount, v_keyword_scans_amount;
    return;
  end if;

  insert into public.credit_batches
    (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining,
     stripe_payment_intent_id, stripe_checkout_session_id, pack_id, expires_at)
  values
    (p_user_id, 'purchase', v_checks_amount, v_checks_amount, v_keyword_scans_amount, v_keyword_scans_amount,
     p_stripe_payment_intent_id, p_stripe_checkout_session_id, p_pack_id, p_expires_at)
  returning id into v_new_batch_id;

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
  values
    (p_user_id, v_new_batch_id, 'purchased', v_checks_amount, 'check', p_stripe_payment_intent_id),
    (p_user_id, v_new_batch_id, 'purchased', v_keyword_scans_amount, 'keyword_scan', p_stripe_payment_intent_id);

  update public.profiles
    set checks_balance = checks_balance + v_checks_amount
    where id = p_user_id;

  return query select false, v_new_batch_id, v_checks_amount, v_keyword_scans_amount;
end;
$function$;

revoke execute on function public.grant_pack_credits(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_pack_credits(uuid, text, text, text, timestamptz) to service_role;

-- ============================================================================
-- expire_credit_batches (extended for both credit types; production body
-- for checks_balance is unchanged by the SEPARATE trigger repair -- this
-- version only adds the keyword_scans_remaining handling this migration
-- itself introduces)
-- ============================================================================
create or replace function public.expire_credit_batches()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_batch record;
begin
  for v_batch in
    select id, user_id, checks_remaining, keyword_scans_remaining
    from public.credit_batches
    where expires_at is not null and expires_at < now()
      and (checks_remaining > 0 or keyword_scans_remaining > 0)
    for update skip locked
  loop
    perform 1 from public.profiles where id = v_batch.user_id for update;

    update public.credit_batches
      set checks_remaining = 0, keyword_scans_remaining = 0
      where id = v_batch.id;

    update public.profiles
      set checks_balance = greatest(checks_balance - v_batch.checks_remaining, 0)
      where id = v_batch.user_id;

    if v_batch.checks_remaining > 0 then
      insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
      values (v_batch.user_id, v_batch.id, 'expired', -v_batch.checks_remaining, 'check');
    end if;
    if v_batch.keyword_scans_remaining > 0 then
      insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
      values (v_batch.user_id, v_batch.id, 'expired', -v_batch.keyword_scans_remaining, 'keyword_scan');
    end if;
  end loop;
end;
$function$;

select cron.schedule(
  'expire-credit-batches',
  '0 3 * * *',
  $$select public.expire_credit_batches()$$
);

-- ============================================================================
-- Hourly cleanup of expired cached Keyword Scan results
-- ============================================================================
create or replace function public.cleanup_expired_keyword_scan_results()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.keyword_scan_reservations
    set result = null
    where result is not null
      and result_expires_at is not null
      and result_expires_at < now();
end;
$function$;

revoke execute on function public.cleanup_expired_keyword_scan_results() from public, anon, authenticated;

select cron.schedule(
  'cleanup-expired-keyword-scan-results',
  '0 * * * *',
  $$select public.cleanup_expired_keyword_scan_results()$$
);
