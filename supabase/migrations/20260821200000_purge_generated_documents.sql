-- Extends the 24h upload-purge job (see upload_auto_purge) to also cover
-- generated documents (tailored CV / cover letter / recruiter email / zip),
-- which the generate-documents edge function writes to the `documents`
-- storage bucket at a deterministic path (`${user_id}/${checkId}/...`) with
-- no path column to track — until now nothing ever deleted them. Generated
-- documents get the same 24h retention window as the original upload
-- (measured from checks.created_at, matching the existing uploads_purged
-- bookkeeping), not a separate, longer window.
--
-- The actual Storage object deletion still happens in the
-- purge-expired-uploads edge function; this migration only adds the
-- bookkeeping columns it now reads/writes.

alter table public.checks
  add column documents_purged boolean not null default false,
  add column documents_purged_at timestamptz;
