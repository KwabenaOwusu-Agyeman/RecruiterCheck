-- Schema for the private admin control centre (myrecruitercheck-admin).
--
-- Three new tables, all additive. Nothing existing is altered or dropped, no
-- RLS is weakened, and no customer-facing behaviour changes.
--
-- All three follow the service-role-only pattern already used by refund_events,
-- feature_flags and check_score_audits: RLS enabled with zero policies, all
-- privileges revoked from anon and authenticated, and select/insert granted to
-- service_role alone. The admin app reads them server-side with the service
-- role; no browser ever touches them directly.

-- admin_users ----------------------------------------------------------------
-- The authorisation allowlist. Membership here is the ONLY thing that grants
-- admin access. There is no is_admin flag on profiles, no email pattern match
-- and no JWT claim, so an ordinary user cannot become an admin by editing
-- anything they control.
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'owner' check (role in ('owner', 'admin')),
  timezone text not null default 'Europe/London',
  created_at timestamptz not null default now(),
  disabled_at timestamptz
);

comment on table public.admin_users is
  'Admin dashboard allowlist. Presence of a row with disabled_at is null is the sole grant of admin access. Service-role read only.';
comment on column public.admin_users.timezone is
  'IANA zone used to compute the dashboard''s day, week and month boundaries for this admin.';
comment on column public.admin_users.disabled_at is
  'Set to revoke access without losing the audit trail. Never delete a row that appears in admin_audit_log.';

alter table public.admin_users enable row level security;
-- service_role is included in the revoke because Supabase's default privileges
-- grant it ALL on new tables in public, before the explicit grant below runs.
-- Revoking first means the grant that follows is the complete privilege set.
-- The app can therefore only read the allowlist, never write it: adding or
-- removing an admin takes a migration, so a compromised admin session cannot
-- promote anyone.
revoke all on table public.admin_users from anon, authenticated, service_role;
grant select on table public.admin_users to service_role;

-- admin_audit_log ------------------------------------------------------------
-- Append-only record of every privileged admin action, successful or not.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users (user_id),
  admin_email text not null,
  action text not null,
  target_type text,
  target_id text,
  reason text,
  before jsonb,
  after jsonb,
  result text not null check (result in ('success', 'failure')),
  error_summary text,
  correlation_id uuid not null,
  created_at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Append-only. Every privileged admin action, whether it succeeded or failed. Never contains CV text, job descriptions, generated documents, tokens or secrets.';
comment on column public.admin_audit_log.before is
  'Redacted snapshot of the target before the action. Safe operational fields only.';
comment on column public.admin_audit_log.error_summary is
  'Sanitised category or short message, never a raw exception or stack trace.';

create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;
-- Revoking from service_role too is what actually removes the UPDATE and
-- DELETE that Supabase's default privileges hand out; granting select and
-- insert afterwards does not take them away on its own.
revoke all on table public.admin_audit_log from anon, authenticated, service_role;
grant select, insert on table public.admin_audit_log to service_role;

-- Table-privilege revocation alone is not enough, because the table owner
-- bypasses it. These triggers make the append-only property hold regardless of
-- which role issues the statement.
create or replace function public.reject_admin_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'admin_audit_log is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

drop trigger if exists admin_audit_log_no_update_delete on public.admin_audit_log;
create trigger admin_audit_log_no_update_delete
  before update or delete on public.admin_audit_log
  for each row execute function public.reject_admin_audit_log_mutation();

drop trigger if exists admin_audit_log_no_truncate on public.admin_audit_log;
create trigger admin_audit_log_no_truncate
  before truncate on public.admin_audit_log
  for each statement execute function public.reject_admin_audit_log_mutation();

-- admin_support_notes --------------------------------------------------------
-- Lightweight internal support annotation. Notes are about customers, so they
-- are treated as sensitive and never leave the service-role boundary.
create table if not exists public.admin_support_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  admin_user_id uuid not null references public.admin_users (user_id),
  body text not null check (length(body) > 0 and length(body) <= 4000),
  category text not null default 'other'
    check (category in ('payment', 'refund', 'credits', 'check_failure', 'account', 'other')),
  status text not null default 'open' check (status in ('open', 'waiting', 'resolved')),
  related_check_id uuid references public.checks (id) on delete set null,
  related_batch_id uuid references public.credit_batches (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint admin_support_notes_resolved_at_matches_status check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

comment on table public.admin_support_notes is
  'Internal support notes written by admins about a customer account. Never surfaced to the customer.';

create index if not exists admin_support_notes_user_idx
  on public.admin_support_notes (user_id, created_at desc);
create index if not exists admin_support_notes_status_idx
  on public.admin_support_notes (status, created_at desc);

alter table public.admin_support_notes enable row level security;
revoke all on table public.admin_support_notes from anon, authenticated, service_role;
grant select, insert, update on table public.admin_support_notes to service_role;

drop trigger if exists admin_support_notes_set_updated_at on public.admin_support_notes;
create trigger admin_support_notes_set_updated_at
  before update on public.admin_support_notes
  for each row execute function public.set_updated_at();

-- Seed the owner -------------------------------------------------------------
-- Resolved by email at apply time rather than hardcoding a UUID. If no account
-- matches, nothing is inserted and the dashboard has no one who can sign in --
-- so this raises a warning rather than failing silently. It never fails the
-- migration, because a seed problem must not block DDL that has already run.
do $$
declare
  v_seeded integer;
begin
  insert into public.admin_users (user_id, email, role)
  select u.id, u.email, 'owner'
  from auth.users u
  where lower(u.email) = lower('fullcircle.ai@gmail.com')
  on conflict (user_id) do nothing;

  get diagnostics v_seeded = row_count;

  if v_seeded = 0 and not exists (select 1 from public.admin_users) then
    raise warning
      'admin_users is empty: no auth.users row matched the seed email. Insert the owner manually or nobody can sign in to the admin dashboard.';
  end if;
end
$$;
