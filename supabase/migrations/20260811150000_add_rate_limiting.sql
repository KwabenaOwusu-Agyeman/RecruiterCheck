-- MEDIUM FIX: per-user rate limiting on extract-job-url and
-- generate-documents. Both do real work per call (an outbound fetch to an
-- arbitrary user-supplied URL; a full OpenAI generation plus CV re-parse
-- and PDF rendering) with no cap today beyond the free/paid check-analysis
-- usage counters, which don't apply to either of these endpoints.
--
-- Service-role-only table (RLS enabled, no policies — same pattern as
-- analyze_requests/extension_connect_codes/stripe_webhook_events): no
-- anon/authenticated client ever reads or writes this directly.
create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bucket text not null,
  created_at timestamptz not null default now()
);

create index rate_limit_events_user_bucket_created_idx
  on public.rate_limit_events (user_id, bucket, created_at);

alter table public.rate_limit_events enable row level security;

-- Fixed-window counter: counts this user's events in `bucket` within the
-- last p_window_seconds: allows and records the call if under p_limit,
-- otherwise denies without recording. Sweeps rows older than 24 hours on
-- each call (a fixed retention, not tied to the caller's window, so a
-- short-window bucket's cleanup can never delete a longer-window bucket's
-- still-relevant rows) — same "cheap periodic cleanup on the hot path"
-- precedent as sweep_stale_processing_checks.
create or replace function public.check_and_record_rate_limit(
  p_user_id uuid,
  p_bucket text,
  p_limit integer,
  p_window_seconds integer
) returns boolean
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_count integer;
begin
  delete from rate_limit_events where created_at < now() - interval '24 hours';

  select count(*) into v_count
    from rate_limit_events
    where user_id = p_user_id
      and bucket = p_bucket
      and created_at > now() - (p_window_seconds || ' seconds')::interval;

  if v_count >= p_limit then
    return false;
  end if;

  insert into rate_limit_events (user_id, bucket) values (p_user_id, p_bucket);
  return true;
end;
$function$;

revoke execute on function public.check_and_record_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_and_record_rate_limit(uuid, text, integer, integer) to service_role;
