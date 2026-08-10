-- Usage integrity fix: consumption must never be derived from COUNT(*) over
-- `checks`, because deleting a completed check (via the delete-check edge
-- function, or previously via a direct client DELETE under RLS) would then
-- restore the user's free/daily allowance. This migration introduces durable
-- counters on `profiles` that only ever increase, are never touched by
-- deleting a check, and are incremented exactly once per completed check via
-- a single atomic RPC.

alter table public.profiles
  add column lifetime_checks_consumed integer not null default 0
    check (lifetime_checks_consumed >= 0),
  add column daily_checks_consumed integer not null default 0
    check (daily_checks_consumed >= 0),
  add column daily_checks_reset_at date;

-- Backfill from existing check history so no user gets a bonus check at
-- cutover: free users' lifetime counter reflects their completed checks to
-- date, paid users' daily counter reflects today's (UTC) completed checks.
update public.profiles p
set lifetime_checks_consumed = c.cnt
from (
  select user_id, count(*) as cnt
  from public.checks
  where status = 'completed'
  group by user_id
) c
where c.user_id = p.id;

update public.profiles p
set daily_checks_consumed = coalesce(c.cnt, 0),
    daily_checks_reset_at = (now() at time zone 'utc')::date
from public.profiles p2
left join (
  select user_id, count(*) as cnt
  from public.checks
  where status = 'completed'
    and created_at >= date_trunc('day', now() at time zone 'utc')
  group by user_id
) c on c.user_id = p2.id
where p2.id = p.id
  and p.subscription_tier <> 'free';

-- Replaces the previous COUNT(*)-over-checks version. Consumption is now
-- gated on the durable counters above; a separate live-'processing' check
-- still blocks concurrent duplicate submissions, independent of consumption.
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
  v_daily_limit constant integer := 8;
  v_stale_after constant interval := interval '10 minutes';
  v_today date := (now() at time zone 'utc')::date;
  v_lifetime_consumed integer;
  v_daily_consumed integer;
  v_daily_reset_at date;
  v_processing_count integer;
begin
  perform 1 from profiles where id = p_user_id for update;

  select subscription_tier, lifetime_checks_consumed, daily_checks_consumed, daily_checks_reset_at
    into v_tier, v_lifetime_consumed, v_daily_consumed, v_daily_reset_at
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
    if v_daily_reset_at = v_today and v_daily_consumed >= v_daily_limit then
      return query select false, 'daily_limit';
      return;
    end if;
  end if;

  update checks set status = 'processing', error_message = null where id = p_check_id;
  return query select true, null::text;
end;
$function$;

-- Marks a check completed and records usage in one atomic, idempotent step.
-- Idempotent because a check already in 'completed' status is a no-op: a
-- duplicate call (e.g. a retried request after a network blip on the first
-- response) can never increment usage twice for the same check.
create or replace function public.complete_check_analysis(
  p_check_id uuid,
  p_user_id uuid,
  p_score integer,
  p_detected_language text
)
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_status check_status;
  v_tier subscription_tier;
  v_today date := (now() at time zone 'utc')::date;
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
        error_message = null
    where id = p_check_id;

  select subscription_tier into v_tier from profiles where id = p_user_id;

  if v_tier = 'free' then
    update profiles set lifetime_checks_consumed = lifetime_checks_consumed + 1 where id = p_user_id;
  else
    update profiles
      set daily_checks_consumed = case when daily_checks_reset_at = v_today then daily_checks_consumed + 1 else 1 end,
          daily_checks_reset_at = v_today
      where id = p_user_id;
  end if;
end;
$function$;

revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text) from public;
grant execute on function public.complete_check_analysis(uuid, uuid, integer, text) to service_role;

-- Deletion must never affect usage (now structurally true, since neither
-- counter lives on `checks`), but direct client deletes still skipped the
-- delete-check edge function's storage cleanup, orphaning CV files. All
-- deletes now go through that function (service role), which the frontend
-- already exclusively uses.
drop policy if exists "Users can delete own checks" on public.checks;
