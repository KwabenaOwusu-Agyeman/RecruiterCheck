-- Instagram (Meta) integration: single-connection token store + publish audit
-- log. There is exactly one Instagram Professional account for this whole
-- site (MyRecruiterCheck's own account), so this is intentionally a
-- singleton table rather than one row per user — nothing here is
-- user-scoped or reachable by anon/authenticated roles. Only edge functions
-- running with the service-role key (instagram-oauth-callback,
-- instagram-refresh-token, instagram-mcp) ever touch these tables.

create table if not exists public.instagram_connection (
  id boolean primary key default true,
  ig_user_id text not null,
  ig_username text not null,
  access_token text not null,
  token_expires_at timestamptz not null,
  scopes text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_connection_singleton check (id)
);

comment on table public.instagram_connection is
  'Singleton row holding the long-lived Instagram access token for the one MyRecruiterCheck Instagram Professional account. Service-role access only.';

alter table public.instagram_connection enable row level security;

-- Deliberately no policies for anon/authenticated: with RLS enabled and zero
-- policies, every non-service-role query is denied outright. The service
-- role bypasses RLS entirely, which is the only way this table is read or
-- written.
revoke all on public.instagram_connection from anon, authenticated;

create table if not exists public.instagram_audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tool_name text not null,
  test_mode boolean not null,
  request_summary jsonb not null,
  result_summary jsonb,
  status text not null check (status in ('success', 'error', 'rejected')),
  error_message text
);

comment on table public.instagram_audit_log is
  'Audit trail of every instagram-mcp tool invocation (publish and read alike). request_summary/result_summary must never contain access tokens or app secrets.';

alter table public.instagram_audit_log enable row level security;
revoke all on public.instagram_audit_log from anon, authenticated;

create index if not exists instagram_audit_log_created_at_idx
  on public.instagram_audit_log (created_at desc);
