-- Replaces the public.landing_stats view with a security definer function.
--
-- Two problems with the view this drops (20260829002146_landing_stats_view):
--
--  1. It ran with owner privileges over public.checks with no
--     security_invoker, which the Supabase linter flags as a Security
--     Definer View. Its own comment justified that by pointing at
--     public_testimonials, but that view had already been rewritten five
--     days earlier (20260824220100) to use security_invoker plus an
--     explicit RLS policy. The pattern it cited no longer existed.
--
--  2. More seriously, `grant select` on the view made the aggregates a
--     public endpoint. The anon key ships in the client bundle, so anyone
--     could read exact check volume, account count and median time to a
--     verdict at any time. The publication floor lived only in the page
--     (STATS_FLOOR), which gates what is *rendered*, not what is *served*.
--
-- security_invoker is not a fix here. public_testimonials could switch to
-- it because feature_consent gives an RLS policy something to key on;
-- checks has no such column, and any anon readable policy on it would
-- expose candidate rows. Aggregating over a table nobody may read is a
-- legitimate use of elevated privilege, so it moves into a function where
-- the elevation is explicit, the search_path is pinned, and the floor is
-- enforced on the server.
--
-- Below the floor the function reports meets_floor = false and nothing
-- else. This is a deliberate change from the view, whose comment promised
-- it "always tells the truth": a small true number told to the public is
-- the disclosure. Above the floor every figure is exact, still computed in
-- the database so the published numbers cannot drift from the truth.
--
-- Nothing row level leaves this function at any volume: no user ids, no
-- job titles, no scores, only counts and two medians over completed
-- checks.

drop view if exists public.landing_stats;

create or replace function public.get_landing_stats()
returns table (
  meets_floor boolean,
  checks_completed int,
  accounts int,
  roles_covered int,
  avg_rerun_score_delta int,
  rerun_pairs int,
  median_minutes_to_verdict int
)
language sql
stable
security definer
set search_path = ''
as $$
  with completed as (
    select user_id, lower(job_title) as role_key, interview_probability_score, created_at, updated_at
    from public.checks
    where status = 'completed'
  ),
  -- Score movement between the first and latest completed check a user ran
  -- against the same job title: the closest queryable proxy for "checked,
  -- fixed the CV, checked again".
  reruns as (
    select
      (array_agg(interview_probability_score order by created_at desc))[1]
        - (array_agg(interview_probability_score order by created_at asc))[1] as score_delta
    from completed
    where interview_probability_score is not null
    group by user_id, role_key
    having count(*) >= 2
  ),
  -- Column names here deliberately differ from the RETURNS TABLE columns,
  -- which are in scope as output parameters inside the body.
  totals as (
    select
      (select count(*) from completed)::int as n_checks,
      (select count(distinct user_id) from completed)::int as n_accounts,
      (select count(distinct role_key) from completed)::int as n_roles,
      (select round(avg(score_delta))::int from reruns) as n_delta,
      (select count(*) from reruns)::int as n_pairs,
      (select round(percentile_cont(0.5) within group (order by extract(epoch from (updated_at - created_at)) / 60))::int
         from completed) as n_median
  ),
  -- The floor below which nothing is published. "7 checks run" costs more
  -- trust than the empty space it fills, and at that volume a single
  -- rerun's score movement would be one identifiable user's. Roughly 250
  -- checks across 100 accounts is where these figures stop describing
  -- individuals and start describing a product. This is the only copy of
  -- the floor: the page reads meets_floor rather than deciding for itself.
  gated as (
    select *, (n_checks >= 250 and n_accounts >= 100) as passes from totals
  )
  select
    passes,
    case when passes then n_checks end,
    case when passes then n_accounts end,
    case when passes then n_roles end,
    case when passes then n_delta end,
    case when passes then n_pairs end,
    case when passes then n_median end
  from gated;
$$;

comment on function public.get_landing_stats() is
  'Aggregates over completed checks for the landing page proof block. security definer because it aggregates public.checks, which anon may not read; safe because it takes no arguments, has a pinned empty search_path, and returns only counts and medians. Returns meets_floor = false and null figures until volume clears 250 checks across 100 accounts, so a small real number is never published. Never add a user id, job title or per row value to the return type.';

revoke all on function public.get_landing_stats() from public;
grant execute on function public.get_landing_stats() to anon, authenticated;
