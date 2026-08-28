-- ============================================================================
-- Pre-existing bug fix: protect_profile_billing_fields_trigger silently
-- reverts expire_credit_batches()'s nightly clawback of profiles.checks_balance,
-- because pg_cron jobs run with no request.jwt.claims (auth.role() = NULL,
-- which IS DISTINCT FROM 'service_role'). credit_batches.checks_remaining
-- correctly zeroes (no trigger there); profiles.checks_balance does not.
--
-- Fix: add a second, independently-evaluated allowance to the trigger for
-- genuine internal PostgreSQL maintenance sessions (cron, dashboard,
-- migrations) -- proven via direct execution-context testing (see the
-- branch verification report) to require ALL THREE of:
--   current_user = 'postgres'
--   session_user = 'postgres'
--   current_setting('request.jwt.claims', true) is null
-- Every PostgREST-routed request (anon, authenticated, or reaching this
-- trigger from inside a SECURITY DEFINER function) always carries JWT
-- claims and never runs as session_user = 'postgres', so this grouped
-- condition cannot be satisfied by any such request.
--
-- expire_credit_batches() itself is NOT modified -- its own logic was
-- already correct; only the trigger blocking its write is being fixed.
--
-- STATUS: applied to myrecruitercheck-scoring-test only. NOT applied to
-- production. Kept separate from the baseline trigger-attachment migration
-- and from both Keyword Scan migrations.
--
-- ============================================================================
-- PRODUCTION DEPLOYMENT PRECONDITION -- role-graph security sanity check
-- ============================================================================
-- The trigger's internal-maintenance exemption is safe only because no
-- PostgREST-reachable role (anon, authenticated, service_role, or the
-- authenticator role PostgREST itself connects as) can ever present as
-- current_user = 'postgres' AND session_user = 'postgres' simultaneously --
-- verified on myrecruitercheck-scoring-test by confirming none of them hold
-- membership in the postgres role. This assumption must be re-verified on
-- production BEFORE this migration is ever applied there, and periodically
-- afterward as a repeatable sanity check. Run:
--
--   select rolname,
--     'postgres' = any(array(
--       select b.rolname from pg_auth_members m
--       join pg_roles b on b.oid = m.roleid
--       where m.member = r.oid
--     )) as can_become_postgres
--   from pg_roles r
--   where rolname in ('anon','authenticated','service_role','authenticator');
--
-- Production deployment of this fix MUST STOP if any of the following hold:
--   - Any login-capable role other than the expected internal PostgreSQL
--     role (postgres / supabase_admin) can become postgres via SET ROLE.
--   - authenticator is a member of postgres.
--   - anon, authenticated, or service_role can become postgres.
--   - The actual role graph otherwise differs materially from what was
--     tested on the scoring-test project (i.e. any of the four rows above
--     return can_become_postgres = true, where the tested/expected result
--     for all four is false).
-- ============================================================================

do $$
declare
  v_expected_current_def text := $ex$CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.role() is distinct from 'service_role' then
    new.lifetime_checks_consumed := old.lifetime_checks_consumed;
    new.checks_balance := old.checks_balance;
    new.keyword_scans_consumed := old.keyword_scans_consumed;
  end if;
  return new;
end;
$function$
$ex$;
  v_actual_def text;
begin
  select pg_get_functiondef('public.protect_profile_billing_fields()'::regprocedure) into v_actual_def;
  if v_actual_def is distinct from v_expected_current_def then
    raise exception 'protect_profile_billing_fields() does not match the expected pre-fix definition -- refusing to apply this repair over an unverified body. Actual: %', v_actual_def;
  end if;
end $$;

create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role'
     and not (
       current_user = 'postgres'
       and session_user = 'postgres'
       and current_setting('request.jwt.claims', true) is null
     )
  then
    new.lifetime_checks_consumed := old.lifetime_checks_consumed;
    new.checks_balance := old.checks_balance;
    new.keyword_scans_consumed := old.keyword_scans_consumed;
  end if;
  return new;
end;
$function$;

do $$
declare
  v_trigger_row record;
begin
  select tgenabled, tgfoid::regproc::text as tgfunc, tgrelid::regclass::text as tgtable
    into v_trigger_row
    from pg_trigger
    where tgname = 'protect_profile_billing_fields_trigger' and not tgisinternal;

  if not found then
    raise exception 'protect_profile_billing_fields_trigger not found on public.profiles -- baseline repair migration must be applied first';
  end if;
  if v_trigger_row.tgenabled is distinct from 'O'
     or v_trigger_row.tgfunc is distinct from 'protect_profile_billing_fields'
     or v_trigger_row.tgtable is distinct from 'profiles'
  then
    raise exception 'protect_profile_billing_fields_trigger exists but is not in the expected state (enabled=%, function=%, table=%)', v_trigger_row.tgenabled, v_trigger_row.tgfunc, v_trigger_row.tgtable;
  end if;
end $$;
