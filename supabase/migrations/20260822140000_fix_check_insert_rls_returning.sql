-- CV upload was failing for every non-power-tier user with "Could not save
-- CV": createDraftCheck's `.insert(...).select().single()` (and
-- updateDraftCheck/replaceDraftCv's `.update(...).select().single()`) throws
-- because Postgres rechecks INSERT/UPDATE ... RETURNING rows against the
-- table's SELECT policy. The "Users can view own checks" policy from
-- fix_check_history_rls_recursion decides visibility by asking
-- most_recent_check_id() for the newest row and comparing it to the row
-- being checked. But a row inserted (or updated) by the *current* command
-- is not visible to a subquery run by that same command (the classic
-- "can't see your own command's writes" MVCC rule — CommandCounterIncrement
-- hasn't run yet) — so most_recent_check_id() always returns the
-- previously-committed row, never the one just written, and the RETURNING
-- recheck fails every time for any tier other than 'power'.
--
-- Fix: instead of picking "the most recent row" via a self-referencing
-- ORDER BY/LIMIT (which needs the row-under-check to be visible to that
-- subquery), ask "does any *other* row have a newer created_at than this
-- one". The row's own created_at is available directly from the tuple being
-- checked — no self-visibility required — and a brand-new INSERT is by
-- definition newer than every already-committed row, so the check passes
-- without needing to see itself.

create or replace function public.is_most_recent_check(p_user_id uuid, p_created_at timestamptz)
returns boolean
language sql
security definer
set search_path = 'public'
stable
as $function$
  select not exists (
    select 1 from public.checks
    where user_id = p_user_id
      and p_user_id = auth.uid()
      and created_at > p_created_at
  );
$function$;

revoke execute on function public.is_most_recent_check(uuid, timestamptz) from public, anon;
grant execute on function public.is_most_recent_check(uuid, timestamptz) to authenticated;

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    (select subscription_tier from public.profiles where id = auth.uid()) = 'power'
    or public.is_most_recent_check(auth.uid(), created_at)
  )
);

drop function if exists public.most_recent_check_id(uuid);
