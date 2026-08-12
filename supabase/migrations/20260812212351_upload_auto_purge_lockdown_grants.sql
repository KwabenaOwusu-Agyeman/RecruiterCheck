-- The database's default privileges grant EXECUTE on newly created public-
-- schema functions to anon/authenticated; revoking from PUBLIC alone (as in
-- the previous migration) doesn't remove those already-materialized direct
-- grants. These functions are pg_cron-invoked maintenance routines with no
-- legitimate caller other than the scheduled job itself.
revoke execute on function public.sweep_old_purge_log() from anon, authenticated;

-- pg_net's extension descriptor was catalogued under public by the default
-- CREATE EXTENSION in the previous migration; its actual callable functions
-- (net.http_post etc.) already live in their own "net" schema regardless,
-- which is not in the API-exposed schemas (see supabase/config.toml).
-- Recreating it under extensions (where this project's other extensions
-- live) is a pure hygiene fix — pg_net doesn't support
-- ALTER EXTENSION ... SET SCHEMA, so this drops and recreates it;
-- net.http_post is immediately available again afterward for the cron job
-- that calls it.
drop extension pg_net;
create extension pg_net with schema extensions;
