-- Full check history is now a Starter/Active/Power pack feature again (per
-- the original tiered design), not unconditional for everyone. Rule: a user
-- sees their full history if they have EVER purchased an Active or Power
-- pack (credit_batches.pack_id in ('medium','large')) -- this is a
-- lifetime-purchase check, not tied to remaining balance or which specific
-- check is being viewed, since "access to check history" reads as an
-- account-level perk earned by having bought that tier at least once.
-- Starter-only (or free-tier-only) users see just their most recent check,
-- same restriction shape as the old subscription-tier version.
--
-- most_recent_check_id is recreated exactly as it worked before (dropped
-- when history was made unconditional) to avoid the same
-- self-referencing-policy infinite recursion bug that motivated it
-- originally (see fix_check_history_rls_recursion.sql) -- a plain subquery
-- against `checks` inside `checks`' own RLS policy cannot see the row under
-- evaluation, so this has to run as SECURITY DEFINER outside that policy.

create or replace function public.most_recent_check_id(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = 'public'
stable
as $function$
  select id from public.checks
  where user_id = p_user_id
  order by created_at desc
  limit 1;
$function$;

revoke execute on function public.most_recent_check_id(uuid) from public, anon;
grant execute on function public.most_recent_check_id(uuid) to authenticated;

create or replace function public.get_check_count(p_user_id uuid)
returns integer
language sql
security definer
set search_path = 'public'
stable
as $function$
  select count(*)::integer
  from public.checks
  where user_id = p_user_id
    and p_user_id = auth.uid();
$function$;

revoke execute on function public.get_check_count(uuid) from public;
grant execute on function public.get_check_count(uuid) to authenticated;

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    exists (
      select 1 from public.credit_batches
      where credit_batches.user_id = auth.uid()
        and credit_batches.pack_id in ('medium', 'large')
    )
    or id = public.most_recent_check_id(auth.uid())
  )
);
