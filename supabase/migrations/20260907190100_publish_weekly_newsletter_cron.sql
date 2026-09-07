-- Weekly invocation of publish-weekly-newsletter, mirroring the existing
-- purge-expired-uploads (20260812212009_upload_auto_purge.sql) and
-- instagram-refresh-token (20260822130000_instagram_refresh_token_cron.sql)
-- jobs: pg_net calls the edge function over HTTP, authenticated with the
-- service-role key pulled from Vault.
--
-- Sunday 08:00 UTC. The function does not send: it creates a Brevo campaign
-- scheduled for 09:00 Europe/Amsterdam the following Monday, roughly a day
-- later. That gap is deliberate and is the whole safety story for an
-- unattended send. The issue goes out with nobody doing anything, and a week
-- that reads badly can still be cancelled in Brevo before it reaches a single
-- inbox. Email cannot be recalled.
--
-- Moving this schedule later shortens that window. Moving it past Monday 09:00
-- Amsterdam means the function schedules into the past, which Brevo rejects,
-- and the week fails closed rather than sending immediately.
--
-- The job is safe to re-run. publish-weekly-newsletter refuses to build a
-- second issue for an ISO week that already has one scheduled, enforced by the
-- unique (year, week) on newsletter_issues.
--
-- MANUAL STEP REQUIRED (already done for the two jobs above, listed here so
-- this migration is readable on its own): the 'service_role_key' Vault secret
-- must exist --
--   select vault.create_secret('<your service_role key>', 'service_role_key');
-- run once via the Supabase SQL editor. The key value itself is never
-- committed here.
--
-- The timeout covers the worst case rather than the typical one. A run makes
-- four external calls and can retry the model once: 15s of feeds in parallel,
-- then up to two generation attempts at 45s, then 20s for Brevo, which is 125s.
-- A 120s timeout would abandon the request while the function was still
-- working, and the function would go on to create the campaign anyway, so
-- pg_net would record a failure that did not happen. 180s leaves headroom.
--
-- Abandoning is no longer dangerous, since the week is reserved before Brevo is
-- called and a second run finds the reservation, but a log that lies about
-- whether an email went out is worth avoiding on its own.
select cron.schedule(
  'publish-weekly-newsletter',
  '0 8 * * 0',
  $$
  select
    net.http_post(
      url := 'https://lqhpjluskinuocumwtml.supabase.co/functions/v1/publish-weekly-newsletter',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 180000
    ) as request_id;
  $$
);

-- cron.schedule upserts by job name, so re-running this migration is a no-op
-- rather than a second job. This guard is copied from 20260828064817: two jobs
-- with one name would send the issue twice, and the unique constraint on
-- newsletter_issues would turn the second into a recorded failure rather than
-- a second campaign, but a duplicate is still worth refusing outright.
do $$
begin
  if (select count(*) from cron.job where jobname = 'publish-weekly-newsletter') > 1 then
    raise exception 'Duplicate cron job publish-weekly-newsletter';
  end if;
end $$;
