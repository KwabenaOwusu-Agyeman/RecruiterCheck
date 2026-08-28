-- Simulated PRIOR-DRAFT schema state for myrecruitercheck-scoring-test, as
-- 02_test_reconciliation.sql itself describes it: production's pre-existing
-- tables (profiles/checks/credit_batches/check_ledger/stripe_webhook_events,
-- identical to 00_stub_schema.sql) PLUS an already-deployed earlier draft of
-- the keyword_scan_reservations feature (V2's superseded table shape) that
-- 02 must reconcile forward. Local, disposable validation only.

create extension if not exists pgcrypto;

create schema if not exists auth;
create table auth.users (id uuid primary key default gen_random_uuid());

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
  keyword_scans_consumed integer not null default 0 check (keyword_scans_consumed >= 0),
  -- Draft-only test column, unused by any real code path -- Step 6 drops it.
  keyword_scan_balance integer default 0
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

-- Test project has 0 stripe_webhook_events rows (per 02's own Step 10
-- comment) -- base draft shape only, no legacy backfill needed here.
create table public.stripe_webhook_events (
  id text primary key,
  created_at timestamptz not null default now()
);

create or replace function public.check_and_record_rate_limit(p_user_id uuid, p_bucket text, p_limit integer, p_window_seconds integer)
returns boolean language sql as $$ select true $$;

create schema if not exists cron;
create table cron.job (jobname text);
create or replace function cron.schedule(jobname text, schedule text, command text) returns bigint language sql as $$ select 1::bigint $$;

-- ============================================================================
-- V2's superseded draft of keyword_scan_reservations, already deployed to
-- the test project ahead of the corrected design: last_attempted_at (not
-- lease_expires_at), credit_source nullable, no completeness/lease
-- constraints yet, plus a client-facing SELECT policy that the corrected
-- design revokes in favor of RPC-only access.
-- ============================================================================
create table public.keyword_scan_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null,
  status text not null default 'reserved',
  credit_source text,
  batch_id uuid references public.credit_batches (id),
  created_at timestamptz not null default now(),
  last_attempted_at timestamptz,
  completed_at timestamptz,
  released_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  unique (user_id, idempotency_key)
);

alter table public.keyword_scan_reservations enable row level security;
create policy "Users can view own keyword scan reservations" on public.keyword_scan_reservations
  for select using (auth.uid() = user_id);
grant select on public.keyword_scan_reservations to authenticated;

-- Superseded helper from an earlier draft -- Step 7 drops this signature.
create or replace function public.restore_keyword_scan_credit(p_user_id uuid, p_credit_source text, p_batch_id uuid)
returns void language plpgsql as $$
begin
  update public.profiles set keyword_scan_balance = keyword_scan_balance + 1 where id = p_user_id;
end;
$$;

-- ============================================================================
-- Representative fixture rows, every state the reconciliation must handle.
-- ============================================================================
insert into auth.users (id) values
  ('a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-00000000000b');
insert into public.profiles (id, keyword_scans_consumed, keyword_scan_balance) values
  ('a0000000-0000-0000-0000-00000000000a', 1, 3),
  ('b0000000-0000-0000-0000-00000000000b', 0, 0);

-- A completed, paid purchase batch with some remaining and some already
-- consumed against it (draft credit_batches shape -- no refund_status et al).
insert into public.credit_batches (id, user_id, source, checks_granted, checks_remaining, stripe_payment_intent_id, stripe_checkout_session_id, pack_id, granted_at, expires_at)
values ('c0000000-0000-0000-0000-0000000000c1', 'a0000000-0000-0000-0000-00000000000a', 'purchase', 5, 3, 'pi_prior_draft_001', 'cs_prior_draft_001', 'small', now() - interval '10 days', now() + interval '80 days');

-- An already-expired purchase batch (fully consumed before expiry).
insert into public.credit_batches (id, user_id, source, checks_granted, checks_remaining, stripe_payment_intent_id, stripe_checkout_session_id, pack_id, granted_at, expires_at)
values ('c0000000-0000-0000-0000-0000000000c2', 'a0000000-0000-0000-0000-00000000000a', 'purchase', 5, 0, 'pi_prior_draft_002', 'cs_prior_draft_002', 'small', now() - interval '100 days', now() - interval '10 days');

-- 1. free / completed
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at, completed_at, result, result_expires_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-free-completed-01', 'completed', 'free', null, now() - interval '2 days', now() - interval '2 days',
  '{"match_percent":80,"matched_total":4,"missing_total":1,"matched_terms":["a","b","c","d"],"missing_terms":["e"]}'::jsonb, now() + interval '5 days');

-- 2. free / released
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at, released_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-free-released-01', 'released', 'free', null, now() - interval '3 days', now() - interval '3 days');

-- 3. paid / completed (against batch c1)
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at, completed_at, result, result_expires_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-paid-completed-01', 'completed', 'paid', 'c0000000-0000-0000-0000-0000000000c1', now() - interval '1 day', now() - interval '1 day',
  '{"match_percent":60,"matched_total":3,"missing_total":2,"matched_terms":["a","b","c"],"missing_terms":["d","e"]}'::jsonb, now() + interval '6 days');

-- 4. paid / reserved, still "in flight" per the draft's own heartbeat column.
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-paid-reserved-01', 'reserved', 'paid', 'c0000000-0000-0000-0000-0000000000c1', now() - interval '30 seconds');

-- 5. Known test-project drift, case A: null credit_source (Step 2 target).
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-drift-null-source-01', 'reserved', null, null, now() - interval '1 hour');

-- 6. Known test-project drift, case B: credit_source='paid' but batch_id is
-- null (an early draft bug where paid reservations weren't always linked to
-- a batch) -- Step 2's second reclassification target.
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at)
values ('a0000000-0000-0000-0000-00000000000a', 'draft-drift-paid-no-batch-01', 'reserved', 'paid', null, now() - interval '1 hour');

-- 7. Legacy row for the second user, free/completed, to prove the
-- reconciliation is not single-user-specific.
insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, last_attempted_at, completed_at, result, result_expires_at)
values ('b0000000-0000-0000-0000-00000000000b', 'draft-free-completed-b-01', 'completed', 'free', null, now() - interval '4 days', now() - interval '4 days',
  '{"match_percent":100,"matched_total":2,"missing_total":0,"matched_terms":["x","y"],"missing_terms":[]}'::jsonb, now() + interval '3 days');
