-- Switch from unlimited-with-8/day-cap Weekly/Monthly subscriptions to three
-- weekly subscription plans with a fixed per-week check allotment (Starter 5,
-- Active 10, Power 20), no rollover, resetting every billing period. Still
-- Stripe Subscriptions (cancel anytime via the billing portal), just a
-- different allotment shape. There are no existing subscribers, so the tier
-- model is replaced outright rather than migrated.

drop table if exists public.subscriptions;

-- get_check_limit, checks_used_this_period, and period_reset_at were already
-- dead: superseded by the durable-counter RPCs in durable_usage_counters.sql
-- and never read anywhere since.
drop function if exists public.get_check_limit(public.subscription_tier);

alter table public.profiles
  drop column if exists checks_used_this_period,
  drop column if exists period_reset_at,
  drop column if exists daily_checks_consumed,
  drop column if exists daily_checks_reset_at,
  drop column if exists subscription_tier,
  drop column if exists subscription_status;

drop type if exists public.subscription_tier;
drop type if exists public.subscription_status;

create type public.subscription_tier as enum ('free', 'starter', 'active', 'power');
create type public.subscription_status as enum ('active', 'cancelled', 'past_due', 'trialing');

alter table public.profiles
  add column subscription_tier public.subscription_tier not null default 'free',
  add column subscription_status public.subscription_status not null default 'active',
  -- Consumption within the current weekly billing period. Reset to 0 by the
  -- webhook on every successful charge (initial + each weekly renewal), not
  -- by calendar day/week, so it always tracks the subscriber's own billing
  -- cycle rather than a shared UTC clock. period_checks_limit is set from the
  -- plan at the same time, so a plan change takes effect on the next reset.
  add column period_checks_consumed integer not null default 0
    check (period_checks_consumed >= 0),
  add column period_checks_limit integer not null default 0
    check (period_checks_limit >= 0);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan public.subscription_tier not null,
  status public.subscription_status not null default 'active',
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_plan_paid check (plan in ('starter', 'active', 'power'))
);

create index subscriptions_user_id_idx on public.subscriptions (user_id);

create trigger subscriptions_set_updated_at
before update on public.subscriptions
for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users can view own subscriptions"
on public.subscriptions for select
using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Reservation / completion RPCs
-- ---------------------------------------------------------------------------

drop function if exists public.reserve_check_analysis(uuid, uuid);

create or replace function public.reserve_check_analysis(p_check_id uuid, p_user_id uuid)
returns table(allowed boolean, reason text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_tier subscription_tier;
  v_status check_status;
  v_free_limit constant integer := 1;
  v_stale_after constant interval := interval '10 minutes';
  v_lifetime_consumed integer;
  v_period_consumed integer;
  v_period_limit integer;
  v_processing_count integer;
begin
  perform 1 from profiles where id = p_user_id for update;

  select subscription_tier, lifetime_checks_consumed, period_checks_consumed, period_checks_limit
    into v_tier, v_lifetime_consumed, v_period_consumed, v_period_limit
    from profiles where id = p_user_id;

  if v_tier is null then
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

  if v_tier = 'free' then
    if v_lifetime_consumed >= v_free_limit then
      return query select false, 'free_tier_limit';
      return;
    end if;
  else
    if v_period_consumed >= v_period_limit then
      return query select false, 'period_limit';
      return;
    end if;
  end if;

  update checks set status = 'processing', error_message = null where id = p_check_id;
  return query select true, null::text;
end;
$function$;

drop function if exists public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer);

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
  v_tier subscription_tier;
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

  select subscription_tier into v_tier from profiles where id = p_user_id;

  if v_tier = 'free' then
    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
  else
    update profiles set period_checks_consumed = period_checks_consumed + 1 where id = p_user_id;
  end if;
end;
$function$;

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Guard trigger: only the trusted backend (service role) may change billing
-- or usage-counter fields on a profile directly.
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
    new.period_checks_consumed := old.period_checks_consumed;
    new.period_checks_limit := old.period_checks_limit;
  end if;
  return new;
end;
$function$;
