-- Full teardown of the dormant weekly-subscription system, at the user's
-- explicit request to avoid backend confusion, rather than leaving it as
-- inert Phase 2 infrastructure. Safe: confirmed zero live subscribers
-- before the original check_pack_system migration, and no code anywhere
-- (frontend or edge functions) references subscription_tier,
-- subscription_status, stripe_customer_id, or the subscriptions table any
-- more as of this migration.

drop table if exists public.subscriptions;

alter table public.profiles
  drop column if exists subscription_tier,
  drop column if exists subscription_status,
  drop column if exists stripe_customer_id;

drop type if exists public.subscription_tier;
drop type if exists public.subscription_status;

-- Guard trigger: drop the columns that no longer exist.
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    new.lifetime_checks_consumed := old.lifetime_checks_consumed;
    new.checks_balance := old.checks_balance;
    new.keyword_scans_consumed := old.keyword_scans_consumed;
  end if;
  return new;
end;
$function$;
