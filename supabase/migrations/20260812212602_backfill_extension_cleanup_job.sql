-- Backfills into version control a pg_cron job that was previously created
-- directly against the live database outside of any tracked migration
-- (discovered while adding the upload_auto_purge job — see the comment in
-- 20260812212009_upload_auto_purge.sql). cron.schedule() upserts by job
-- name, so re-running this against the live project, where the job already
-- exists, is a safe no-op; it also makes the schedule reproducible from a
-- fresh database.
select cron.schedule(
  'cleanup-job-captures-and-connect-codes',
  '0 * * * *',
  $$
    delete from public.job_captures where expires_at < now();
    delete from public.extension_connect_codes where expires_at < now();
  $$
);
