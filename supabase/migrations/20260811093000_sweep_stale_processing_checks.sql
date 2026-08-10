-- A check can get stuck in 'processing' forever if the edge function process
-- is killed/crashes between reserve_check_analysis succeeding and the normal
-- markFailed/complete_check_analysis path running (e.g. a platform-level
-- isolate timeout). Previously nothing ever moved such a row out of
-- 'processing': the Feedback page just showed "still being reviewed"
-- indefinitely with no retry option. This sweeps any check that has sat in
-- 'processing' past reserve_check_analysis's own 10 minute staleness window
-- (with a small buffer) into 'failed', which the existing FeedbackPage retry
-- UI already handles — no frontend change needed.
create or replace function public.sweep_stale_processing_checks()
returns void
language sql
security definer
set search_path = 'public'
as $function$
  update public.checks
  set status = 'failed',
      error_message = 'This check took too long to process. Please retry.'
  where status = 'processing'
    and updated_at < now() - interval '12 minutes';
$function$;

revoke execute on function public.sweep_stale_processing_checks() from public;

select cron.schedule(
  'sweep-stale-processing-checks',
  '*/5 * * * *',
  $$select public.sweep_stale_processing_checks()$$
);
