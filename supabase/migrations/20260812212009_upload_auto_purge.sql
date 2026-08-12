-- Automatic 24h deletion of original CV/job-description uploads. Original
-- uploads (the CV file in storage + the job_description text column) are
-- distinct from generated results (feedback, scores, job_title,
-- company_name), which are retained in My Checks until the user deletes the
-- check or their account. This migration adds the bookkeeping columns and
-- the minimal audit log; the actual file deletion happens in the
-- purge-expired-uploads edge function (SQL alone cannot reliably delete the
-- underlying Storage object), invoked on a schedule below.
--
-- Note: the pg_net extension and function-execute grants created below were
-- tightened by the follow-up migration
-- 20260812212351_upload_auto_purge_lockdown_grants.sql (pg_net relocated
-- out of the public schema; EXECUTE explicitly revoked from
-- anon/authenticated, which this project's default privileges grant
-- directly and which REVOKE ... FROM PUBLIC alone does not remove). Both
-- must be applied in order to reach the intended end state.

alter table public.checks
  add column uploads_purged boolean not null default false,
  add column uploads_purged_at timestamptz,
  add column upload_purge_attempts int not null default 0;

create table public.upload_purge_log (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.checks(id) on delete set null,
  attempted_at timestamptz not null default now(),
  success boolean not null,
  attempt_number int not null
);

-- Service-role only: no policies, RLS enabled. Never stores file names, file
-- content, CV text, or job-description text — id + timestamp + outcome only.
alter table public.upload_purge_log enable row level security;

create index upload_purge_log_check_id_idx on public.upload_purge_log(check_id);

-- Sweep the log itself so it doesn't grow unbounded; 90 days is far beyond
-- anything a manual investigation into a failed purge would need.
create or replace function public.sweep_old_purge_log()
returns void
language sql
security definer
set search_path = 'public'
as $function$
  delete from public.upload_purge_log
  where attempted_at < now() - interval '90 days';
$function$;

revoke execute on function public.sweep_old_purge_log() from public;

-- pg_net (async HTTP from Postgres) is required to call the edge function
-- from pg_cron and was not previously enabled on this project.
create extension if not exists pg_net;

-- Invokes the purge-expired-uploads edge function every 15 minutes. The
-- edge function does the actual Storage API delete (via the service-role
-- client) plus blanks cv_storage_path/cv_file_name/job_description on each
-- expired row; this job only has to reach it over HTTP. The project ref in
-- the URL is stable for the life of the project (it does not change on
-- redeploys), so it's safe to inline here rather than via Vault.
--
-- MANUAL STEP REQUIRED: this references a Vault secret named
-- 'service_role_key' that must be created once via the Supabase dashboard
-- (Project Settings > Vault) or SQL editor:
--   select vault.create_secret('<your service_role key>', 'service_role_key');
-- The actual key value is never committed to this migration file.
select cron.schedule(
  'purge-expired-uploads',
  '*/15 * * * *',
  $$
  select
    net.http_post(
      url := 'https://lqhpjluskinuocumwtml.supabase.co/functions/v1/purge-expired-uploads',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  select public.sweep_old_purge_log();
  $$
);

-- job_captures (browser extension handoff, 48h expiry) and
-- extension_connect_codes (5 min expiry) already carry an expires_at column.
-- Verification during this migration found a pg_cron job named
-- 'cleanup-job-captures-and-connect-codes' already runs hourly against the
-- live project deleting expired rows from both — created directly against
-- the project (same as job_captures/extension_connect_codes themselves, see
-- 20260811120000_backfill_extension_tables.sql), not through a checked-in
-- migration. See the companion backfill migration
-- 20260812212505_backfill_extension_cleanup_job.sql documenting it. No new
-- job is added here to avoid running the same delete twice.
