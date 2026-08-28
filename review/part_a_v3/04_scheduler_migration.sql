-- ============================================================================
-- Scheduler migration for reconcile-ambiguous-refunds. Separate from
-- 01_production_migration.sql per Item B's scheduler decision: pg_cron
-- invokes the Edge Function via pg_net (the project's established secure
-- HTTP invocation mechanism -- pg_net is already relied on elsewhere in
-- this project's migration history, e.g. upload_auto_purge.sql's use of
-- an HTTP-invoking cron job, confirmed present in this repo's existing
-- migrations). REVIEW ONLY, NOT APPLIED.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'pg_net extension not found -- required for this scheduled HTTP invocation. Confirm it is enabled on this project before applying.';
  end if;
end $$;

create table if not exists public.app_secrets (
  key text primary key,
  value text not null
);
revoke all on public.app_secrets from public, anon, authenticated, service_role;
-- No grants at all -- only accessed via SECURITY DEFINER functions below,
-- never read directly by any role, including service_role.

create or replace function public.invoke_reconcile_ambiguous_refunds()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_url text;
  v_secret text;
begin
  select value into v_url from public.app_secrets where key = 'reconcile_ambiguous_refunds_url';
  select value into v_secret from public.app_secrets where key = 'cron_invoke_secret';

  if v_url is null or v_secret is null then
    raise exception 'invoke_reconcile_ambiguous_refunds: missing app_secrets configuration (reconcile_ambiguous_refunds_url / cron_invoke_secret)';
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$function$;

revoke all on function public.invoke_reconcile_ambiguous_refunds() from public, anon, authenticated, service_role;

select cron.schedule(
  'reconcile-ambiguous-refunds',
  '*/5 * * * *',
  $$select public.invoke_reconcile_ambiguous_refunds()$$
);

do $$
declare v_dup integer;
begin
  select count(*) into v_dup from (select jobname from cron.job group by jobname having count(*) > 1) x;
  if v_dup > 0 then raise exception 'cron.job has % duplicate jobname(s)', v_dup; end if;
end $$;

-- Configuration instructions (manual step, not executable SQL):
-- insert into public.app_secrets (key, value) values
--   ('reconcile_ambiguous_refunds_url', 'https://<project-ref>.supabase.co/functions/v1/reconcile-ambiguous-refunds'),
--   ('cron_invoke_secret', '<a freshly generated random secret, matching CRON_INVOKE_SECRET set as the edge function''s own env var>')
-- on conflict (key) do update set value = excluded.value;
-- Run this manually against each project (production, test) with that
-- project's own URL and its own freshly generated secret -- never the same
-- secret value across environments.
