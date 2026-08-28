-- ============================================================================
-- Reconciliation of PRE-EXISTING schema drift, unrelated to the Keyword
-- Scan product change.
--
-- protect_profile_billing_fields_trigger exists live on production but has
-- no CREATE TRIGGER statement anywhere in this repository's tracked
-- migration history (20260811090000_protect_usage_counter_fields.sql only
-- ever did `create or replace function` for the trigger's function body --
-- it never attached the trigger). The trigger was evidently created
-- directly against production outside the tracked migration flow, the same
-- way stripe_webhook_events existed live before check_pack_system.sql
-- backfilled it into version control.
--
-- This migration backfills the missing CREATE TRIGGER statement so any
-- environment built from a clean replay of tracked migrations (a fresh
-- Supabase branch, a test project, a future disaster-recovery restore)
-- ends up with the same protection production already has. It is written
-- to be a verified no-op on an environment that already has the correct
-- trigger (i.e. production) -- see steps 1-6 below.
--
-- STATUS: applied to myrecruitercheck-scoring-test only for verification.
-- NOT YET applied to production. Production application requires separate,
-- explicit approval even though it is expected to be a no-op there.
-- ============================================================================

do $$
declare
  v_expected_function_def text := $ex$CREATE OR REPLACE FUNCTION public.protect_profile_billing_fields()
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
  v_actual_function_def text;
  v_trigger_row record;
begin
  -- 1. Verify the function exists.
  if not exists (
    select 1 from pg_proc
    where proname = 'protect_profile_billing_fields' and pronamespace = 'public'::regnamespace
  ) then
    raise exception 'public.protect_profile_billing_fields() does not exist -- cannot proceed with trigger backfill';
  end if;

  -- 2. Verify its definition matches the expected tracked definition exactly.
  select pg_get_functiondef('public.protect_profile_billing_fields()'::regprocedure) into v_actual_function_def;
  if v_actual_function_def is distinct from v_expected_function_def then
    raise exception 'public.protect_profile_billing_fields() definition does not match the expected tracked definition -- refusing to attach a trigger to an unverified function. Expected: %  Actual: %', v_expected_function_def, v_actual_function_def;
  end if;

  -- 3. Check whether the trigger already exists on public.profiles.
  select tgname, tgrelid::regclass::text as tgtable, tgtype, tgenabled, tgfoid::regproc::text as tgfunc
    into v_trigger_row
    from pg_trigger
    where tgname = 'protect_profile_billing_fields_trigger' and not tgisinternal;

  if not found then
    -- 4. Absent: create it using the exact production trigger definition.
    execute 'create trigger protect_profile_billing_fields_trigger
             before update on public.profiles
             for each row execute function protect_profile_billing_fields()';
    raise notice 'protect_profile_billing_fields_trigger created (was absent)';
  else
    -- 5. Present: verify it is EXACTLY the expected trigger before leaving
    -- it alone. tgtype 19 = BEFORE (2) + ROW (1) + UPDATE (16) = 19,
    -- matching the production trigger's tgtype confirmed earlier.
    if v_trigger_row.tgtable is distinct from 'public.profiles'
       or v_trigger_row.tgtype is distinct from 19
       or v_trigger_row.tgenabled is distinct from 'O'
       or v_trigger_row.tgfunc is distinct from 'protect_profile_billing_fields'
    then
      raise exception 'A trigger named protect_profile_billing_fields_trigger already exists but does not match the expected definition (table=%, tgtype=%, enabled=%, function=%) -- refusing to silently replace it', v_trigger_row.tgtable, v_trigger_row.tgtype, v_trigger_row.tgenabled, v_trigger_row.tgfunc;
    end if;
    -- 6. Matches exactly: leave unchanged.
    raise notice 'protect_profile_billing_fields_trigger already present and matches expected definition -- no action taken';
  end if;
end $$;
