-- A narrow, service-role-only projection of auth.users for the admin
-- dashboard.
--
-- auth is not one of the schemas exposed through PostgREST
-- (supabase/config.toml exposes public and storage only), so the dashboard
-- cannot read auth.users directly. The alternative, paging
-- auth.admin.listUsers(), silently undercounts once a page limit is reached,
-- which is exactly the kind of quietly-wrong number this dashboard must not
-- produce.
--
-- Only the columns needed to operate the business are selected. Nothing
-- authentication-secret is exposed: encrypted_password, the recovery,
-- confirmation and email-change tokens, and the raw provider payloads are all
-- deliberately absent, and adding one later should be treated as a security
-- change rather than a convenience.
create or replace view public.admin_auth_user_summary
with (security_invoker = true) as
select
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  u.banned_until,
  u.deleted_at
from auth.users u;

comment on view public.admin_auth_user_summary is
  'Service-role-only projection of auth.users for the admin dashboard: identity, signup, last sign-in and verification state. Never exposes password hashes or auth tokens.';

-- security_invoker means the view runs with the caller's own privileges rather
-- than the definer's, so it cannot become a way for a customer to read
-- auth.users. Combined with revoking anon and authenticated, only the service
-- role can select from it, and only because the service role could read
-- auth.users anyway.
revoke all on public.admin_auth_user_summary from anon, authenticated;
grant select on public.admin_auth_user_summary to service_role;
