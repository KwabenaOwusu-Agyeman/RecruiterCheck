-- Aggregate figures for the landing page's (currently dormant) proof block.
--
-- Computed in the database rather than in the page so the published numbers
-- can never drift from the truth. Everything here is an aggregate over
-- completed checks: no user ids, no titles, no row-level data leaves the
-- table. The view runs with owner privileges (the Postgres default for
-- views; security_invoker deliberately NOT set), which is what lets anon
-- read the aggregates over a table whose own RLS denies it everything --
-- the same pattern public_testimonials uses.
--
-- The page-side floor (STATS_FLOOR in src/lib/constants.ts) decides when
-- these numbers are worth showing; the view itself always tells the truth.

create or replace view public.landing_stats as
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
)
select
  (select count(*) from completed)::int as checks_completed,
  (select count(distinct user_id) from completed)::int as accounts,
  (select count(distinct role_key) from completed)::int as roles_covered,
  (select round(avg(score_delta))::int from reruns) as avg_rerun_score_delta,
  (select count(*) from reruns)::int as rerun_pairs,
  (select round(percentile_cont(0.5) within group (order by extract(epoch from (updated_at - created_at)) / 60))::int
     from completed) as median_minutes_to_verdict;

grant select on public.landing_stats to anon, authenticated;
