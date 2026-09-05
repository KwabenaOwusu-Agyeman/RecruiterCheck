-- Two read grants the admin dashboard needs, found by running it rather than
-- by reading the schema.
--
-- 1. admin_auth_user_summary was created with security_invoker = true, which
--    means it executes with the CALLER's privileges. The caller is
--    service_role, and service_role has no SELECT on auth.users, so every read
--    of the view failed with permission denied and the dashboard reported new
--    users, active users and free-to-paid conversion as Unavailable.
--
--    The fix is to let the view run as its owner (the default for a view,
--    i.e. security_invoker off) rather than to grant service_role broad access
--    to auth.users. That choice is deliberate and is the narrower of the two:
--    granting service_role SELECT on auth.users would expose every column of
--    that table, including the password hash and the recovery and
--    confirmation tokens. This view exposes seven operational columns and
--    nothing else, and only to service_role, since anon and authenticated
--    remain revoked.
--
-- 2. refund_events was revoked from service_role by 20260828064817, on the
--    stated reasoning that every legitimate reader reached it through a
--    security definer function. That was true when it was written. The admin
--    dashboard is a new legitimate reader, and without this it cannot show
--    refunds at all, which also made the revenue figure fail because revenue
--    is net of refunds.
--
--    SELECT only. No insert, update or delete: refunds are still executed
--    exclusively through reserve_refund, finalize_refund and fail_refund, and
--    the dashboard remains read-only with respect to money. RLS stays enabled
--    with zero policies, so this changes nothing for anon or authenticated.

alter view public.admin_auth_user_summary set (security_invoker = false);

-- Re-assert the intended access after the option change.
revoke all on public.admin_auth_user_summary from anon, authenticated;
grant select on public.admin_auth_user_summary to service_role;

grant select on table public.refund_events to service_role;

-- Verify the outcome rather than assuming it, in the style of the surrounding
-- migrations: anon and authenticated must hold nothing on either object, and
-- service_role must hold SELECT and nothing more on refund_events.
do $$
declare
  v_bad text;
begin
  select string_agg(grantee || ':' || table_name || ':' || privilege_type, ', ')
    into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('admin_auth_user_summary', 'refund_events')
    and grantee in ('anon', 'authenticated');

  if v_bad is not null then
    raise exception 'anon or authenticated unexpectedly hold privileges: %', v_bad;
  end if;

  select string_agg(privilege_type, ', ')
    into v_bad
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'refund_events'
    and grantee = 'service_role'
    and privilege_type <> 'SELECT';

  if v_bad is not null then
    raise exception 'service_role holds more than SELECT on refund_events: %', v_bad;
  end if;
end $$;
