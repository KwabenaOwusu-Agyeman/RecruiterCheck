-- Phase 1 of the credit-pack pricing rewrite (Bizzy Consulting "Monetize
-- Right" pillar): kills the 3-tier weekly-allotment subscription model in
-- favor of one-time check packs (5/15/40), sized per the deck. No abstracted
-- "credits" currency and no redacted teaser report -- 1 pack-unit = 1 full
-- check, always full features, since AI cost per check (~$0.002-0.004) is
-- negligible regardless of feature set and doesn't justify a weighted
-- currency. The free tier (1 full check, lifetime) is unchanged and stays on
-- lifetime_checks_consumed -- unrelated to the new pack system.
--
-- Subscription infrastructure (subscription_tier, subscriptions table,
-- stripe_customer_id, changeExistingSubscription, the subscription webhook
-- handlers) is deliberately left untouched and unused by this migration --
-- Phase 2 may collapse it to a single "Unlimited Monthly" plan later if
-- real usage data asks for it, but there are zero live subscribers today so
-- there's nothing to migrate and no reason to touch it now. Only the old
-- weekly-allotment columns (period_checks_consumed/period_checks_limit) are
-- dropped, since they belonged to the 3-tier model being retired here, not
-- to subscription infra generally.
--
-- Also backfills stripe_webhook_events, which exists live in production but
-- has no creating migration anywhere in this directory (confirmed via
-- list_migrations against the linked project) -- fixed here, defensively,
-- before new ledger logic depends on its dedupe behavior.

create table if not exists public.stripe_webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

-- ---------------------------------------------------------------------------
-- Credit packs: batches + ledger
-- ---------------------------------------------------------------------------

create table public.credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  source text not null check (source in ('purchase', 'manual_grant')),
  checks_granted integer not null check (checks_granted > 0),
  checks_remaining integer not null check (checks_remaining >= 0),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text,
  pack_id text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);

create index credit_batches_user_expiry_idx
  on public.credit_batches (user_id, expires_at nulls last)
  where checks_remaining > 0;

create table public.check_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  batch_id uuid references public.credit_batches (id),
  entry_type text not null check (entry_type in
    ('purchased', 'used', 'refunded', 'expired', 'manual_adjustment')),
  amount integer not null,
  related_check_id uuid references public.checks (id),
  related_stripe_payment_intent_id text,
  note text,
  created_at timestamptz not null default now()
);

create index check_ledger_user_idx on public.check_ledger (user_id, created_at desc);
create index check_ledger_check_idx on public.check_ledger (related_check_id);

alter table public.credit_batches enable row level security;
alter table public.check_ledger enable row level security;

create policy "Users can view own credit batches"
  on public.credit_batches for select using (auth.uid() = user_id);
create policy "Users can view own ledger"
  on public.check_ledger for select using (auth.uid() = user_id);
-- No insert/update/delete policies for either -- all writes go through the
-- security definer RPCs below, matching how complete_check_analysis already
-- works for lifetime_checks_consumed.

-- ---------------------------------------------------------------------------
-- profiles: new columns, drop the retired weekly-allotment columns
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column checks_balance integer not null default 0
    check (checks_balance >= 0),
  add column keyword_scans_consumed integer not null default 0
    check (keyword_scans_consumed >= 0);

alter table public.profiles
  drop column if exists period_checks_consumed,
  drop column if exists period_checks_limit;

-- ---------------------------------------------------------------------------
-- Guard trigger: extend to the new billing-adjacent columns. Rewritten
-- rather than only adding to it, since period_checks_consumed/limit no
-- longer exist to guard.
-- ---------------------------------------------------------------------------

create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    new.subscription_tier := old.subscription_tier;
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.lifetime_checks_consumed := old.lifetime_checks_consumed;
    new.checks_balance := old.checks_balance;
    new.keyword_scans_consumed := old.keyword_scans_consumed;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Reservation / completion RPCs, rewritten to gate on checks_balance instead
-- of the retired period allotment. Deliberately no longer branches on
-- subscription_tier at all: that column is frozen/unused in Phase 1 (every
-- profile stays 'free' by default since nothing sets it otherwise now that
-- the 3-tier checkout path is gone), so keying funding logic off it would
-- incorrectly treat every pack purchaser as still on the free lifetime
-- allowance. Instead: the free lifetime check is granted first (mirrors
-- today's behavior), then checks_balance funds everything after.
-- ---------------------------------------------------------------------------

create or replace function public.reserve_check_analysis(p_check_id uuid, p_user_id uuid)
returns table(allowed boolean, reason text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_status check_status;
  v_free_limit constant integer := 1;
  v_stale_after constant interval := interval '10 minutes';
  v_lifetime_consumed integer;
  v_checks_balance integer;
  v_processing_count integer;
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

  if v_lifetime_consumed < v_free_limit then
    -- free lifetime check still available, always allowed regardless of balance
    null;
  elsif v_checks_balance <= 0 then
    return query select false, 'no_checks_balance';
    return;
  end if;

  update checks set status = 'processing', error_message = null where id = p_check_id;
  return query select true, null::text;
end;
$function$;

create or replace function public.complete_check_analysis(
  p_check_id uuid,
  p_user_id uuid,
  p_score integer,
  p_detected_language text,
  p_job_title text default null,
  p_company_name text default null,
  p_experience_score integer default null,
  p_skills_score integer default null,
  p_uvp_score integer default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_status check_status;
  v_lifetime_consumed integer;
  v_free_limit constant integer := 1;
  v_batch_id uuid;
begin
  perform 1 from profiles where id = p_user_id for update;

  select status into v_status from checks where id = p_check_id and user_id = p_user_id;
  if v_status is null then
    raise exception 'check_not_found';
  end if;

  if v_status = 'completed' then
    return;
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
        error_message = null
    where id = p_check_id;

  select lifetime_checks_consumed into v_lifetime_consumed from profiles where id = p_user_id;

  if v_lifetime_consumed < v_free_limit then
    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
    return;
  end if;

  select id into v_batch_id
    from credit_batches
    where user_id = p_user_id and checks_remaining > 0
    order by expires_at nulls last
    limit 1
    for update skip locked;

  if v_batch_id is null then
    raise exception 'no_checks_balance';
  end if;

  update credit_batches set checks_remaining = checks_remaining - 1 where id = v_batch_id;
  update profiles set checks_balance = checks_balance - 1 where id = p_user_id;

  insert into check_ledger (user_id, batch_id, entry_type, amount, related_check_id)
  values (p_user_id, v_batch_id, 'used', -1, p_check_id);
end;
$function$;

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Pack purchase / refund / expiry RPCs
-- ---------------------------------------------------------------------------

create or replace function public.grant_check_credits(
  p_user_id uuid,
  p_amount integer,
  p_source text,
  p_stripe_payment_intent_id text default null,
  p_stripe_checkout_session_id text default null,
  p_pack_id text default null,
  p_expires_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_existing_batch_id uuid;
  v_new_batch_id uuid;
begin
  perform 1 from profiles where id = p_user_id for update;

  if p_stripe_payment_intent_id is not null then
    select id into v_existing_batch_id
      from credit_batches
      where stripe_payment_intent_id = p_stripe_payment_intent_id;

    if v_existing_batch_id is not null then
      -- already granted for this payment (idempotent replay of a webhook)
      return;
    end if;
  end if;

  insert into credit_batches
    (user_id, source, checks_granted, checks_remaining, stripe_payment_intent_id, stripe_checkout_session_id, pack_id, expires_at)
  values
    (p_user_id, p_source, p_amount, p_amount, p_stripe_payment_intent_id, p_stripe_checkout_session_id, p_pack_id, p_expires_at)
  returning id into v_new_batch_id;

  insert into check_ledger (user_id, batch_id, entry_type, amount, related_stripe_payment_intent_id)
  values (
    p_user_id,
    v_new_batch_id,
    case when p_source = 'purchase' then 'purchased' else 'manual_adjustment' end,
    p_amount,
    p_stripe_payment_intent_id
  );

  update profiles set checks_balance = checks_balance + p_amount where id = p_user_id;
end;
$function$;

revoke execute on function public.grant_check_credits(uuid, integer, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_check_credits(uuid, integer, text, text, text, text, timestamptz) to service_role;

create or replace function public.refund_check_credit(p_check_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_used_ledger record;
  v_already_refunded boolean;
  v_batch_expires timestamptz;
  v_new_batch_id uuid;
begin
  perform 1 from profiles where id = p_user_id for update;

  select exists(
    select 1 from check_ledger
    where related_check_id = p_check_id and entry_type = 'refunded'
  ) into v_already_refunded;

  if v_already_refunded then
    return;
  end if;

  select * into v_used_ledger
    from check_ledger
    where related_check_id = p_check_id and entry_type = 'used'
    order by created_at desc
    limit 1;

  if v_used_ledger.id is null then
    -- funded by the free lifetime allowance, not a purchased batch
    update profiles set lifetime_checks_consumed = greatest(lifetime_checks_consumed - 1, 0) where id = p_user_id;
    insert into check_ledger (user_id, entry_type, amount, related_check_id)
      values (p_user_id, 'refunded', 1, p_check_id);
    return;
  end if;

  select expires_at into v_batch_expires from credit_batches where id = v_used_ledger.batch_id;

  if v_batch_expires is null or v_batch_expires > now() then
    update credit_batches set checks_remaining = checks_remaining + 1 where id = v_used_ledger.batch_id;
    update profiles set checks_balance = checks_balance + 1 where id = p_user_id;
    insert into check_ledger (user_id, batch_id, entry_type, amount, related_check_id)
      values (p_user_id, v_used_ledger.batch_id, 'refunded', 1, p_check_id);
  else
    insert into credit_batches (user_id, source, checks_granted, checks_remaining, expires_at)
      values (p_user_id, 'manual_grant', 1, 1, null)
      returning id into v_new_batch_id;
    update profiles set checks_balance = checks_balance + 1 where id = p_user_id;
    insert into check_ledger (user_id, batch_id, entry_type, amount, related_check_id)
      values (p_user_id, v_new_batch_id, 'refunded', 1, p_check_id);
  end if;
end;
$function$;

revoke execute on function public.refund_check_credit(uuid, uuid) from public, anon, authenticated;
grant execute on function public.refund_check_credit(uuid, uuid) to service_role;

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
    select id, user_id, checks_remaining
    from credit_batches
    where expires_at is not null and expires_at < now() and checks_remaining > 0
    for update skip locked
  loop
    perform 1 from profiles where id = v_batch.user_id for update;

    update credit_batches set checks_remaining = 0 where id = v_batch.id;
    update profiles set checks_balance = greatest(checks_balance - v_batch.checks_remaining, 0) where id = v_batch.user_id;

    insert into check_ledger (user_id, batch_id, entry_type, amount)
    values (v_batch.user_id, v_batch.id, 'expired', -v_batch.checks_remaining);
  end loop;
end;
$function$;

revoke execute on function public.expire_credit_batches() from public;

select cron.schedule(
  'expire-credit-batches',
  '0 3 * * *',
  $$select public.expire_credit_batches()$$
);

-- ---------------------------------------------------------------------------
-- Full check history for everyone: the old Power-only restriction doesn't
-- map onto "pack size" cleanly and isn't worth preserving in a pack-based
-- model where every unit buys the same full feature set.
-- ---------------------------------------------------------------------------

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (auth.uid() = user_id);

drop function if exists public.most_recent_check_id(uuid);
drop function if exists public.get_check_count(uuid);
