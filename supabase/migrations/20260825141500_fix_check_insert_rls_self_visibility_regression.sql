-- Regression fix: gate_check_history_by_pack (20260825100918) reintroduced
-- tiered check-history gating using a self-referencing ORDER BY/LIMIT lookup
-- (most_recent_check_id), the exact pattern that was already diagnosed and
-- fixed once before in fix_check_insert_rls_returning (see PR #17): Postgres
-- rechecks INSERT ... RETURNING rows against the SELECT policy, and a row
-- just written by the current command is not reliably visible to a
-- self-referencing "ORDER BY created_at DESC LIMIT 1" subquery run as part
-- of that recheck. For any user with zero existing checks and no
-- small/medium/large credit_batches (i.e. every brand new signup's first
-- ever check), most_recent_check_id(auth.uid()) returns NULL, so
-- `id = most_recent_check_id(...)` is never true and the INSERT's RETURNING
-- clause 403s -- confirmed live: a real user with zero rows in
-- checks/credit_batches had both of their createDraftCheck attempts fail
-- with 403 on POST /rest/v1/checks.
--
-- The original fix avoided this by never requiring the subquery to see the
-- row under evaluation: instead of finding "the" most recent id and
-- comparing, it asks "does any OTHER (already committed, always visible)
-- row exist that is newer than this one" -- true regardless of whether this
-- row itself is visible to the subquery. Restoring that shape here.

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
    exists (
      select 1 from public.credit_batches
      where credit_batches.user_id = auth.uid()
        and credit_batches.pack_id in ('small', 'medium', 'large')
    )
    or public.is_most_recent_check(auth.uid(), created_at)
  )
);

-- most_recent_check_id's self-referencing lookup is now unused by any
-- policy; drop it so nothing accidentally depends on the broken pattern again.
drop function if exists public.most_recent_check_id(uuid);
