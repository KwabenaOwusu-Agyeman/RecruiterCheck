-- The "Power keeps full check history, other tiers only see their most
-- recent check" rule was only enforced client-side (MyChecksPage.tsx
-- slicing the array after fetching every row). The old "Users can view own
-- checks" policy still let any authenticated user SELECT every one of their
-- own check rows regardless of tier, so a Starter/Active user could see
-- their full history via the network tab or a direct REST call with their
-- own JWT, bypassing the UI entirely. This moves the restriction into RLS
-- itself, so the extra rows are never returned in the first place.

drop policy if exists "Users can view own checks" on public.checks;

create policy "Users can view own checks"
on public.checks for select
using (
  auth.uid() = user_id
  and (
    (select subscription_tier from public.profiles where id = auth.uid()) = 'power'
    or id = (
      select c2.id from public.checks c2
      where c2.user_id = auth.uid()
      order by c2.created_at desc
      limit 1
    )
  )
);

-- The client still needs to know how many older checks exist to show an
-- accurate "N earlier checks are locked, upgrade to Power" message, but the
-- RLS policy above now hides their row content entirely. This RPC returns
-- only a count (never row data) so that messaging stays accurate without
-- reopening the leak the policy above closes. security definer to read past
-- the same RLS it's compensating for; the p_user_id = auth.uid() check
-- keeps it scoped to the caller's own count only.
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
