-- The "Users can view own checks" policy from enforce_check_history_tier_at_rls
-- referenced public.checks inside its own USING clause (a subquery finding
-- the most recent check id) to decide row visibility. RLS policies apply to
-- every access to the table they're defined on, including references from
-- inside their own USING clause — so evaluating the policy for one row
-- required re-evaluating the same policy for the subquery's rows, forever.
-- This broke every checks SELECT in production with "infinite recursion
-- detected in policy for relation checks" (confirmed live: My Checks page
-- showed "Could not load checks" for every user). Fixed the same way
-- get_check_count already works around this: move the self-referencing
-- lookup into a SECURITY DEFINER function, which runs with the function
-- owner's privileges and so does not re-trigger the calling policy.

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

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    (select subscription_tier from public.profiles where id = auth.uid()) = 'power'
    or id = public.most_recent_check_id(auth.uid())
  )
);
