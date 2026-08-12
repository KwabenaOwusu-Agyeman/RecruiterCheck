-- The first live run (backlog of 31 pre-existing expired checks, processed
-- sequentially with a storage delete + row update + log insert per check)
-- took ~7s, exceeding net.http_post's default 5000ms timeout_milliseconds.
-- The edge function still ran to completion server-side regardless (pg_net
-- timing out only means the calling SQL session stopped waiting for the
-- response body), but a caller genuinely wants to see the outcome rather
-- than a spurious timeout in net._http_response. Raising this on the
-- existing job (cron.schedule upserts by name) rather than shrinking the
-- edge function's own batch size, since real per-tick volume going forward
-- is just newly-expired checks since the last 15-minute tick, not a
-- one-time backlog.
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
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    ) as request_id;
  select public.sweep_old_purge_log();
  $$
);
