-- Daily invocation of instagram-refresh-token, mirroring the existing
-- purge-expired-uploads cron job (20260812212009_upload_auto_purge.sql):
-- pg_net calls the edge function over HTTP, authenticated with the
-- service-role key pulled from Vault. Daily is comfortably inside both of
-- Instagram's refresh bounds (>=24h old, <60 days old) — the function
-- itself also no-ops if the stored token is under 24h old, so a schedule
-- change or manual re-run here can't trigger a premature refresh attempt.
--
-- MANUAL STEP REQUIRED (only if not already done for the purge job): the
-- 'service_role_key' Vault secret must exist —
--   select vault.create_secret('<your service_role key>', 'service_role_key');
-- run once via the Supabase SQL editor. The key value itself is never
-- committed here.
select cron.schedule(
  'instagram-refresh-token',
  '0 4 * * *',
  $$
  select
    net.http_post(
      url := 'https://lqhpjluskinuocumwtml.supabase.co/functions/v1/instagram-refresh-token',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
      ),
      body := '{}'::jsonb
    ) as request_id;
  $$
);
