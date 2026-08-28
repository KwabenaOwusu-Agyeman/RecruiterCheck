-- Minimal Supabase-compatible stub schema for LOCAL, DISPOSABLE validation
-- only. Not part of the deployable package. Recreates just enough of
-- auth.* and the pre-existing public tables (matching their REAL column
-- definitions, verified via read-only queries against production earlier
-- in this engagement) for 01_production_migration.sql to apply and run.
-- pg_cron is NOT available in this local install; cron.schedule() calls
-- are stripped from the copy applied here (see run.sh) and validated only
-- by inspection, not execution.

create extension if not exists pgcrypto;

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

-- Faithful to the real Supabase auth.role()/auth.uid() definitions
-- (confirmed via pg_get_functiondef against the live project earlier this
-- session) -- GUC-based, not session/role based.
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create schema if not exists public;

create table public.profiles (
  id uuid primary key references auth.users(id),
  email text not null default 'test@example.invalid',
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lifetime_checks_consumed integer not null default 0 check (lifetime_checks_consumed >= 0),
  checks_balance integer not null default 0 check (checks_balance >= 0),
  keyword_scans_consumed integer not null default 0 check (keyword_scans_consumed >= 0)
);

create type check_status as enum ('draft','processing','completed','failed');
create table public.checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  status check_status not null default 'draft',
  funding_pack_id text
);

create table public.credit_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  source text not null check (source in ('purchase','manual_grant')),
  checks_granted integer not null check (checks_granted > 0),
  checks_remaining integer not null check (checks_remaining >= 0),
  stripe_payment_intent_id text unique,
  stripe_checkout_session_id text,
  pack_id text,
  granted_at timestamptz not null default now(),
  expires_at timestamptz
);

create table public.check_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id),
  batch_id uuid references public.credit_batches(id),
  entry_type text not null check (entry_type in ('purchased','used','refunded','expired','manual_adjustment')),
  amount integer not null,
  related_check_id uuid references public.checks(id),
  related_stripe_payment_intent_id text,
  note text,
  created_at timestamptz not null default now()
);

create table public.stripe_webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

-- Stub matching the real function's observable contract (always allows,
-- for local validation purposes -- rate limiting itself is out of scope
-- for this migration's own correctness).
create or replace function public.check_and_record_rate_limit(p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language sql as $$ select true $$;

-- Fake cron schema/function so `select cron.schedule(...)` calls don't
-- error out -- real scheduling is NOT tested locally (no pg_cron
-- available); this only lets the rest of the migration transaction
-- complete so the schema/RPC logic can be validated.
create schema if not exists cron;
create or replace function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;
