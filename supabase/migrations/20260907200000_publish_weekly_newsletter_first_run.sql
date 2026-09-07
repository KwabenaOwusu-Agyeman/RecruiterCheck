-- A single catch-up run, so the first newsletter does not wait for Sunday.
--
-- The weekly job (20260907190100) fires Sunday 08:00 UTC and schedules the
-- following Monday. Applied on a Monday, that means the first issue would be a
-- week away. This job exists only to produce that first issue now, and then to
-- remove itself. The weekly cadence is untouched: this schedules nothing beyond
-- the one issue.
--
-- WHY EVERY TEN MINUTES rather than a fixed time. A one-off pinned to a clock
-- time only works if the migration is applied before that time, and `supabase
-- db push` is run by hand whenever the founder gets to it. Polling makes the
-- outcome independent of when that happens: the first tick after the schema
-- lands does the work.
--
-- It removes itself on either condition:
--
--   1. Any row exists in newsletter_issues, whatever its status. Deliberately
--      "any" and not "scheduled": a run that reserved the week and then failed
--      at Brevo leaves a failed row, and retrying that automatically every ten
--      minutes would hammer the feeds and a paid model API without a human ever
--      seeing why it failed. One attempt, then stop and let the Control Centre
--      alert say so. The weekly job picks it up on Sunday regardless.
--   2. The deadline has passed. Without this, a job that never succeeded would
--      poll forever, calling two job feeds and a paid model API every ten
--      minutes. The deadline is after the first weekly run on 13 September, so
--      by then condition 1 has fired regardless.
--
-- Applied after the deadline, the job's first tick unschedules it and does
-- nothing else. That is the intended behaviour, not a failure: the normal
-- Sunday cadence takes over and nothing is sent unexpectedly.
--
-- The `firstRun` flag asks the function for the next 09:00 Amsterdam at least
-- three hours away, rather than the next Monday. Three hours is a shorter
-- window than the weekly run's day, and it is still a window: the issue can be
-- cancelled in Brevo before it sends. Brevo rejects a scheduledAt in the past,
-- so this cannot degrade into an immediate send.
select cron.schedule(
  'publish-weekly-newsletter-first-run',
  '*/10 * * * *',
  $job$
  do $inner$
  begin
    if exists (select 1 from public.newsletter_issues)
       or now() > timestamptz '2026-09-15 00:00:00+00' then
      perform cron.unschedule('publish-weekly-newsletter-first-run');
    else
      perform net.http_post(
        url := 'https://lqhpjluskinuocumwtml.supabase.co/functions/v1/publish-weekly-newsletter',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
        ),
        body := '{"firstRun": true}'::jsonb,
        timeout_milliseconds := 180000
      );
    end if;
  end
  $inner$;
  $job$
);

-- Same duplicate guard as the weekly job. cron.schedule upserts by name, so
-- re-running this migration is a no-op rather than a second poller.
do $$
begin
  if (select count(*) from cron.job where jobname = 'publish-weekly-newsletter-first-run') > 1 then
    raise exception 'Duplicate cron job publish-weekly-newsletter-first-run';
  end if;
end $$;
