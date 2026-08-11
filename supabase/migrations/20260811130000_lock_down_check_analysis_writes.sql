-- CRITICAL FIX 1: protect trusted analysis-result fields on public.checks.
--
-- The existing RLS UPDATE/INSERT policies only check auth.uid() = user_id,
-- with no column restriction, and no trigger equivalent to
-- protect_profile_billing_fields exists for `checks`. This let an
-- authenticated client PATCH/INSERT their own check row directly with
-- status='completed' and a fabricated score, fully bypassing the
-- analyze-check -> OpenAI -> reserve_check_analysis/complete_check_analysis
-- flow and its usage-counter consumption.
--
-- Mirrors the protect_profile_billing_fields pattern on profiles: on UPDATE,
-- a non-service-role caller's changes to analysis fields are silently
-- reverted to their prior value; on INSERT, a non-service-role caller's
-- analysis fields are forced to the safe "unset draft" state regardless of
-- what was submitted. The INSERT policy additionally requires status =
-- 'draft' at the RLS layer as a first line of defense.
create or replace function public.protect_check_analysis_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    if tg_op = 'UPDATE' then
      new.status := old.status;
      new.interview_probability_score := old.interview_probability_score;
      new.experience_score := old.experience_score;
      new.skills_score := old.skills_score;
      new.uvp_score := old.uvp_score;
      new.detected_language := old.detected_language;
      new.error_message := old.error_message;
    elsif tg_op = 'INSERT' then
      -- A non-draft status at insert time can only mean a client is trying
      -- to fabricate an already-completed check — reject outright rather
      -- than silently coercing, so this fails loudly instead of quietly
      -- succeeding as a draft the caller didn't ask for.
      if new.status is distinct from 'draft' then
        raise exception 'insufficient_privilege: only the trusted backend may create a check with status %', new.status
          using errcode = '42501';
      end if;
      new.interview_probability_score := null;
      new.experience_score := null;
      new.skills_score := null;
      new.uvp_score := null;
      new.detected_language := null;
      new.error_message := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists checks_protect_analysis_fields on public.checks;
create trigger checks_protect_analysis_fields
before insert or update on public.checks
for each row execute function public.protect_check_analysis_fields();

-- protect_check_analysis_fields() is a trigger function only, invoked
-- implicitly by the trigger above. Every function created in this schema
-- gets a default EXECUTE grant to PUBLIC, which anon/authenticated inherit
-- through implicit PUBLIC membership regardless of any grant made directly
-- to them — so both PUBLIC and the two client roles must be revoked
-- explicitly, or the function stays reachable at
-- /rest/v1/rpc/protect_check_analysis_fields despite revoking the named
-- roles alone (verified live: revoking only anon/authenticated left
-- has_function_privilege('anon', ..., 'EXECUTE') = true until PUBLIC was
-- also revoked).
revoke execute on function public.protect_check_analysis_fields() from public, anon, authenticated;

-- Belt-and-suspenders at the RLS layer: a client-created check must start
-- as a draft. Combined with the trigger above (which also zeroes out the
-- analysis fields on INSERT for non-service-role callers), a client can no
-- longer create a pre-completed or pre-scored row by either path.
drop policy if exists "Users can insert own checks" on public.checks;
create policy "Users can insert own checks"
on public.checks for insert
with check (auth.uid() = user_id and status = 'draft');

-- CRITICAL FIX 2: complete_check_analysis and sweep_stale_processing_checks
-- are SECURITY DEFINER functions intended only for the trusted backend
-- (analyze-check via the service-role client, and pg_cron respectively).
-- Earlier migrations only ran `revoke ... from public`, which does not
-- remove the separate EXECUTE grants Supabase applies directly to anon and
-- authenticated when a function is created in the public schema. Verified
-- live via has_function_privilege() that both roles could still execute
-- these — revoke explicitly from both.
revoke execute on function public.complete_check_analysis(uuid, uuid, integer, text, text, text, integer, integer, integer) from anon, authenticated;
revoke execute on function public.sweep_stale_processing_checks() from anon, authenticated;
