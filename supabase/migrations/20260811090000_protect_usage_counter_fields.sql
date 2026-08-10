-- The existing protect_profile_billing_fields trigger locks subscription_tier/
-- subscription_status/stripe_customer_id to service-role-only writes, but did
-- not cover the new durable usage counters (lifetime_checks_consumed,
-- daily_checks_consumed, daily_checks_reset_at). Since RLS lets a user UPDATE
-- their own profile row, an authenticated client could otherwise call
-- supabase.from('profiles').update({ lifetime_checks_consumed: 0 }) directly
-- and fully bypass the free-tier limit fix (durable_usage_counters). Only
-- complete_check_analysis (service_role) may change these fields now.
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  if auth.role() is distinct from 'service_role' then
    new.subscription_tier := old.subscription_tier;
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.lifetime_checks_consumed := old.lifetime_checks_consumed;
    new.daily_checks_consumed := old.daily_checks_consumed;
    new.daily_checks_reset_at := old.daily_checks_reset_at;
  end if;
  return new;
end;
$function$;
