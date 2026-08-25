-- Advisor flagged expire_credit_batches (a cron-only job that mutates other
-- users' balances) as callable by anon/authenticated via
-- /rest/v1/rpc/expire_credit_batches — "revoke ... from public" alone
-- doesn't remove Supabase's default per-role grants. Lock it down properly;
-- only pg_cron (which runs as the function owner) should ever call this.
revoke execute on function public.expire_credit_batches() from public, anon, authenticated;
