-- Backfills two tables into version control that were previously created
-- directly against the live database outside of any tracked migration
-- (job_captures, extension_connect_codes — support the browser extension's
-- capture-and-handoff flow). Written idempotently (IF NOT EXISTS / DROP+CREATE
-- POLICY) so it is a safe no-op against the live project, where these objects
-- already exist, while still making them reproducible from a fresh database.

create table if not exists public.job_captures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  job_title text,
  company_name text,
  job_description text not null,
  job_url text,
  source_domain text,
  created_at timestamptz not null default now(),
  -- Short-lived: the extension hands off a capture id in a URL, the web app
  -- consumes it once on New Check load, and it's never needed afterward.
  expires_at timestamptz not null default (now() + interval '48 hours')
);

create index if not exists job_captures_expires_at_idx on public.job_captures (expires_at);

alter table public.job_captures enable row level security;

drop policy if exists "Users can select own job captures" on public.job_captures;
create policy "Users can select own job captures"
  on public.job_captures for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can insert own job captures" on public.job_captures;
create policy "Users can insert own job captures"
  on public.job_captures for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Users can delete own job captures" on public.job_captures;
create policy "Users can delete own job captures"
  on public.job_captures for delete
  to authenticated
  using (user_id = auth.uid());

create table if not exists public.extension_connect_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  user_id uuid not null references public.profiles (id) on delete cascade,
  used boolean not null default false,
  created_at timestamptz not null default now(),
  -- Deliberately very short lived (an OAuth-style connect code exchanged
  -- once immediately after issuance) to limit the window an intercepted
  -- code could be replayed in.
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

create index if not exists extension_connect_codes_expires_at_idx on public.extension_connect_codes (expires_at);

-- Intentionally no RLS policies beyond enabling it: this table is only ever
-- read/written by the create-extension-connect-code and
-- exchange-extension-connect-code edge functions via the service role,
-- which bypasses RLS entirely. No anon/authenticated client access is
-- expected or wanted.
alter table public.extension_connect_codes enable row level security;
