-- Defense in depth for the three service-role-only tables flagged by the
-- Supabase security advisor.
--
-- These tables already deny anon and authenticated at the privilege layer:
-- migration 20260828064817 revokes all grants on each, leaving only a
-- service_role SELECT on feature_flags and keyword_scan_canary_users, and
-- nothing at all on refund_events. Enabling RLS adds a second, independent
-- lock so that a future blanket grant such as
-- "grant all on all tables in schema public to authenticated" cannot
-- silently expose them.
--
-- No policies are created, on purpose: zero policies means deny all. Every
-- legitimate reader bypasses RLS already.
--   * postgres owns all three tables and every security definer function
--     that touches them (reserve_keyword_scan, reserve_refund,
--     finalize_refund, fail_refund, recover_external_refund,
--     reconcile_ambiguous_refunds, list_ambiguous_refund_candidates), and
--     holds BYPASSRLS.
--   * service_role holds BYPASSRLS, so the edge functions are unaffected.
--
-- FORCE ROW LEVEL SECURITY is deliberately NOT set. Forcing it would subject
-- the table owner to RLS and break every security definer function above.

alter table public.feature_flags enable row level security;
alter table public.keyword_scan_canary_users enable row level security;
alter table public.refund_events enable row level security;

-- Fail loudly if the state is not exactly "RLS enabled, not forced", matching
-- the verification style of the surrounding migrations.
do $$
declare
  v_bad text;
begin
  select string_agg(c.relname, ', ')
    into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('feature_flags', 'keyword_scan_canary_users', 'refund_events')
    and (c.relrowsecurity = false or c.relforcerowsecurity = true);

  if v_bad is not null then
    raise exception 'RLS not in the expected state (enabled, not forced) for: %', v_bad;
  end if;
end $$;
