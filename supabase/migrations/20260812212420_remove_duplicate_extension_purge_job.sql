-- Discovered during this migration's own verification pass: a pg_cron job
-- named 'cleanup-job-captures-and-connect-codes' already existed (created
-- directly against the live project, not via a checked-in migration — same
-- situation as job_captures/extension_connect_codes themselves, see
-- 20260811120000_backfill_extension_tables.sql) doing the exact same
-- expires_at cleanup an earlier draft of this change had added a second
-- time under the name 'purge-expired-extension-data'. Removing the
-- duplicate rather than running two jobs that do the same delete.
--
-- Written to be a safe no-op on a fresh database, where the duplicate was
-- never created in the first place (the committed upload_auto_purge
-- migration no longer creates it either).
select cron.unschedule(jobid) from cron.job where jobname = 'purge-expired-extension-data';

drop function if exists public.purge_expired_extension_data();
