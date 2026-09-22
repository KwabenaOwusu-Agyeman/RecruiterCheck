-- ============================================================================
-- Drop the unused Keyword Scan reservation functions and their cron jobs.
--
-- 20260828064817_part_a_keyword_scan_credits_and_refund_integrity.sql added a
-- reservation based Keyword Scan (per pack scan credits, reserve, complete,
-- release). The live keyword-scan edge function never adopted it: it counts
-- free scans on profiles.keyword_scans_consumed and makes scans unlimited
-- after any purchase, which is the approved rule (Product and Pricing, "Keyword
-- scans become unlimited after buying any check pack"). Founder decision
-- 2026-09-22: keep it unlimited and remove the unused reservation functions.
--
-- Removed here:
--   reserve_keyword_scan, complete_keyword_scan,
--   release_keyword_scan_reservation, poll_keyword_scan_status
--     Nothing calls them, but all four were executable by any authenticated
--     user through the REST API.
--   reconcile_abandoned_keyword_scan_reservations,
--   cleanup_expired_keyword_scan_results
--     Called only by the two pg_cron jobs unscheduled below.
--
-- Deliberately kept, because live payment and refund code still reads them:
--   public.keyword_scan_reservations (counted by reserve_refund),
--   credit_batches.keyword_scans_granted / keyword_scans_remaining (written by
--   grant_pack_credits, compared by reserve_refund), and
--   check_ledger.keyword_scan_reservation_id. Removing those means rewriting
--   the Stripe fulfilment and refund functions, a separate reviewed change.
--
-- No CASCADE: if anything unexpected depends on one of these functions, the
-- drop fails and the migration stops instead of taking the dependant with it.
-- ============================================================================

-- Unschedule first, so no job is left pointing at a dropped function. Same
-- form as 20260812212420_remove_duplicate_extension_purge_job.sql: a no-op
-- when the job does not exist.
select cron.unschedule(jobid) from cron.job where jobname = 'reconcile-abandoned-keyword-scans';
select cron.unschedule(jobid) from cron.job where jobname = 'cleanup-expired-keyword-scan-results';

drop function if exists public.reserve_keyword_scan(text);
drop function if exists public.complete_keyword_scan(uuid, jsonb);
drop function if exists public.release_keyword_scan_reservation(uuid);
drop function if exists public.poll_keyword_scan_status(text);
drop function if exists public.reconcile_abandoned_keyword_scan_reservations();
drop function if exists public.cleanup_expired_keyword_scan_results();

-- The Part A comment calls this column frozen. It is the live free scan
-- counter, written by the keyword-scan edge function.
comment on column public.profiles.keyword_scans_consumed is
  'Free Keyword Scans used by an account that has never bought a pack. Incremented by the keyword-scan edge function; scans are unlimited after any purchase.';

comment on table public.keyword_scan_reservations is
  'Unused. Left from the Part A reservation design, whose functions were dropped in 20260922170000. Kept only because reserve_refund still counts it. Nothing inserts into it any more; the rows it holds are historical, from before the functions were dropped.';

do $$
declare
  v_left text[];
begin
  select array_agg(p.proname::text order by p.proname) into v_left
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'reserve_keyword_scan', 'complete_keyword_scan',
        'release_keyword_scan_reservation', 'poll_keyword_scan_status',
        'reconcile_abandoned_keyword_scan_reservations',
        'cleanup_expired_keyword_scan_results'
      );
  if v_left is not null then
    raise exception 'reservation functions still present: %', array_to_string(v_left, ', ');
  end if;

  select array_agg(jobname::text order by jobname) into v_left
    from cron.job
    where jobname in ('reconcile-abandoned-keyword-scans', 'cleanup-expired-keyword-scan-results');
  if v_left is not null then
    raise exception 'reservation cron jobs still scheduled: %', array_to_string(v_left, ', ');
  end if;
end $$;
