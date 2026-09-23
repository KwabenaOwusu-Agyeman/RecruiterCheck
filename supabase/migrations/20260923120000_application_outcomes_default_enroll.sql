-- Application outcome follow up becomes default enrollment, not opt in.
--
-- Implements Decision Log entry DEC-9, "Application outcome follow up,
-- default opt out instead of opt in" (approved 23 September 2026), which
-- reverses one line of DEC-7 ("Data strategy for product value and exit
-- readiness", 16 September 2026). DEC-7 specified "one opt in at the end of
-- a check"; DEC-9 replaces that with automatic enrollment on every completed
-- check, stoppable from the link in the follow up email. Nothing else about
-- the feature changes: same three week timing, same questions, same
-- withdraw mechanism.
--
-- Only checks that transition to 'completed' after this migration runs are
-- enrolled. The trigger fires on the UPDATE that sets status, so a check
-- already completed before this migration exists never fires it and is
-- never retroactively enrolled without having gone through this policy.
--
-- The results page now shows nothing about this feature at all, per DEC-9:
-- no checkbox, no passive notice. The only disclosure is the follow up
-- email itself and its "stop" link, which is the existing /outcome withdraw
-- flow (submit-application-outcome, action "withdraw").
--
-- The client no longer creates or reads these rows itself, so its insert
-- and select access is revoked. consent_version now records this policy,
-- not a wording a user read and ticked, since there is no longer a moment
-- where the user agrees to anything on the page. It carries today's date so
-- a row can be told apart from the opt in era ('2026-09-16') in the Control
-- Centre if that ever matters.

drop policy if exists "Users can opt in for own completed check" on public.application_outcomes;
drop policy if exists "Users can view own application outcome" on public.application_outcomes;
revoke insert (check_id, user_id, consent_version) on public.application_outcomes from authenticated;
revoke select (id, check_id, user_id, consent_at, withdrawn_at, responded_at) on public.application_outcomes from authenticated;

create or replace function public.enroll_application_outcome_followup()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  insert into public.application_outcomes (check_id, user_id, consent_version)
  values (new.id, new.user_id, 'default-enrollment-2026-09-23')
  on conflict (check_id) do nothing;
  return new;
end;
$function$;

revoke all on function public.enroll_application_outcome_followup() from public, anon, authenticated;

drop trigger if exists application_outcomes_auto_enroll on public.checks;
create trigger application_outcomes_auto_enroll
after update on public.checks
for each row
when (new.status = 'completed' and old.status is distinct from 'completed')
execute function public.enroll_application_outcome_followup();

comment on table public.application_outcomes is
  'Default enrollment application outcome follow up (DEC-9), one row per completed check, created by the application_outcomes_auto_enroll trigger. SENSITIVE. Answers arrive via submit-application-outcome using followup_token; users cannot read or write rows directly. Shown in the Control Centre in aggregate only.';

do $$
begin
  if has_column_privilege('authenticated', 'public.application_outcomes', 'user_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.application_outcomes', 'check_id', 'SELECT') then
    raise exception 'authenticated can still read or write application_outcomes directly';
  end if;
end
$$;
