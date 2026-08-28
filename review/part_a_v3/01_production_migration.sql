-- ============================================================================
-- PART A: Keyword Scan credits, Stripe fulfilment hardening, refund
-- integrity. PRODUCTION CANDIDATE -- REVIEW ONLY, NOT APPLIED.
--
-- Deployment dependency: Part B (protect_profile_billing_fields_trigger
-- repair) must be deployed and verified in production FIRST, under its own
-- separate approval. See RUNBOOK.md.
--
-- Global lock order enforced by every function in this file:
--   1. profiles
--   2. credit_batches (when applicable)
--   3. keyword_scan_reservations OR refund_events (when applicable)
-- Identifiers are always discovered via a non-locking read first, then
-- locks are acquired in the order above, then state is re-validated before
-- any mutation. No function in this file deviates from this order.
-- ============================================================================

-- Whole-migration atomicity: if any statement below fails (including the
-- fail-closed purchase-row precondition in Section B), everything in this
-- file rolls back -- no partial schema change is ever left behind.
begin;

-- ===========================================================================
-- SECTION A: feature_flags, canary allowlist
-- ===========================================================================
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on public.feature_flags from public, anon, authenticated, service_role;
grant select on public.feature_flags to service_role;

insert into public.feature_flags (key, enabled) values
  ('keyword_scan_maintenance', true) -- L: starts TRUE. Cutover step 9 is the
                                      -- only place this is ever flipped to
                                      -- false, and only after verification.
on conflict (key) do nothing;

create table if not exists public.keyword_scan_canary_users (
  user_id uuid primary key references public.profiles(id)
);
revoke all on public.keyword_scan_canary_users from public, anon, authenticated, service_role;
grant select on public.keyword_scan_canary_users to service_role;

do $$
declare v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='feature_flags') then
    v_missing := v_missing || 'feature_flags table';
  end if;
  if not exists (select 1 from public.feature_flags where key = 'keyword_scan_maintenance' and enabled = true) then
    v_missing := v_missing || 'keyword_scan_maintenance must default to true';
  end if;
  if array_length(v_missing,1) > 0 then raise exception 'Section A incomplete: %', array_to_string(v_missing, ', '); end if;
end $$;

-- ===========================================================================
-- SECTION B: credit_batches extensions
-- ===========================================================================
alter table public.credit_batches
  add column if not exists keyword_scans_granted integer not null default 0 check (keyword_scans_granted >= 0),
  add column if not exists keyword_scans_remaining integer not null default 0 check (keyword_scans_remaining >= 0),
  add column if not exists refund_status text not null default 'active' check (refund_status in ('active', 'refund_pending', 'refunded')),
  add column if not exists stripe_price_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists amount_paid integer,
  add column if not exists currency text,
  add column if not exists quantity integer;

-- Fail-closed precondition: purchase-row fact integrity. Must run AFTER the
-- columns above exist (so the checks below are structurally valid) but
-- BEFORE credit_batches_purchase_expiry_check / _verified_facts_check are
-- added below. This block NEVER backfills, infers, or assumes any missing
-- fact from pack prices, client metadata, or defaults -- an incompatible row
-- must be resolved by a separate, explicitly-approved action outside this
-- migration, not by this migration itself. Diagnostic output is restricted
-- to counts and batch ids only -- no customer information, no full Stripe
-- objects.
do $$
declare
  v_purchase_count integer;
  v_incompatible_count integer;
  v_incompatible_ids uuid[];
  v_source_counts text;
  v_unsupported_source_count integer;
  v_bad_pack_mapping_count integer;
begin
  select count(*) into v_purchase_count from public.credit_batches where source = 'purchase';

  select count(*), coalesce(array_agg(id order by id), array[]::uuid[])
    into v_incompatible_count, v_incompatible_ids
  from public.credit_batches
  where source = 'purchase' and (
    stripe_payment_intent_id is null
    or stripe_checkout_session_id is null
    or stripe_price_id is null
    or pack_id is null
    or amount_paid is null
    or currency is null
    or quantity is null
    or paid_at is null
    or expires_at is null
  );

  select string_agg(source || '=' || cnt, ', ' order by source) into v_source_counts
  from (select source, count(*) as cnt from public.credit_batches group by source) s;

  raise notice 'Purchase-row precondition audit: % purchase row(s) total, % incompatible. Source counts: %',
    v_purchase_count, v_incompatible_count, coalesce(v_source_counts, '(no rows)');

  if v_incompatible_count > 0 then
    raise exception 'credit_batches purchase-row precondition FAILED: % of % purchase row(s) missing one or more required verified facts (stripe_payment_intent_id, stripe_checkout_session_id, stripe_price_id, pack_id, amount_paid, currency, quantity, paid_at, expires_at). Incompatible batch id(s): %. This migration NEVER backfills, infers, or assumes missing Stripe facts -- resolve these rows via a separate, explicitly-approved action before retrying.',
      v_incompatible_count, v_purchase_count, v_incompatible_ids;
  end if;

  -- Unsupported/unexpected source values: this migration's constraints only
  -- reason about 'purchase' and 'manual_grant'. Any other value is refused
  -- rather than silently exempted from verification.
  select count(*) into v_unsupported_source_count
  from public.credit_batches where source not in ('purchase', 'manual_grant');
  if v_unsupported_source_count > 0 then
    raise exception 'credit_batches has % row(s) with an unsupported source value outside (purchase, manual_grant) -- refusing to proceed until explicitly reviewed.', v_unsupported_source_count;
  end if;

  -- Verified pack-amount consistency: this migration's own grant_pack_credits
  -- defines the only known pack->credit mapping (small=5/5, medium=15/15,
  -- large=40/40). A purchase row whose granted amounts don't match its own
  -- pack_id, or whose pack_id isn't one of these three, is either data
  -- corruption or an undocumented pack -- caught here as a pure internal
  -- consistency check against this migration's own constants, without
  -- needing to contact Stripe.
  select count(*) into v_bad_pack_mapping_count
  from public.credit_batches
  where source = 'purchase' and (
    (pack_id = 'small' and (checks_granted <> 5 or keyword_scans_granted <> 5))
    or (pack_id = 'medium' and (checks_granted <> 15 or keyword_scans_granted <> 15))
    or (pack_id = 'large' and (checks_granted <> 40 or keyword_scans_granted <> 40))
    or (pack_id not in ('small', 'medium', 'large'))
  );
  if v_bad_pack_mapping_count > 0 then
    raise exception 'credit_batches has % purchase row(s) whose granted amounts do not match the known pack_id mapping (small=5/5, medium=15/15, large=40/40), or whose pack_id is unrecognized -- refusing to proceed.', v_bad_pack_mapping_count;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.credit_batches'::regclass and conname = 'credit_batches_purchase_expiry_check') then
    alter table public.credit_batches add constraint credit_batches_purchase_expiry_check
      check (source <> 'purchase' or expires_at is not null);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.credit_batches'::regclass and conname = 'credit_batches_purchase_verified_facts_check') then
    -- F: a purchase-sourced batch must carry the verified Stripe facts it
    -- was fulfilled from -- a purchase row with any of these null is
    -- structurally malformed, never permitted to exist.
    alter table public.credit_batches add constraint credit_batches_purchase_verified_facts_check
      check (source <> 'purchase' or (
        stripe_price_id is not null and amount_paid is not null and currency is not null
        and quantity is not null and paid_at is not null
      ));
  end if;
end $$;

create unique index if not exists credit_batches_stripe_session_unique_idx
  on public.credit_batches (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists credit_batches_user_expiry_ks_idx
  on public.credit_batches (user_id, expires_at nulls last)
  where keyword_scans_remaining > 0 and refund_status = 'active';

do $$
declare v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='keyword_scans_remaining' and data_type='integer') then v_missing := v_missing || 'keyword_scans_remaining:integer'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='refund_status' and is_nullable='NO') then v_missing := v_missing || 'refund_status NOT NULL'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.credit_batches'::regclass and conname='credit_batches_purchase_expiry_check') then v_missing := v_missing || 'purchase_expiry_check'; end if;
  if not exists (select 1 from pg_constraint where conrelid='public.credit_batches'::regclass and conname='credit_batches_purchase_verified_facts_check') then v_missing := v_missing || 'purchase_verified_facts_check'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='credit_batches' and indexname='credit_batches_stripe_session_unique_idx') then v_missing := v_missing || 'stripe_session_unique_idx'; end if;
  if array_length(v_missing,1) > 0 then raise exception 'Section B incomplete: %', array_to_string(v_missing, ', '); end if;
end $$;

-- ===========================================================================
-- SECTION C: check_ledger extensions
-- ===========================================================================
alter table public.check_ledger add column if not exists credit_type text;
update public.check_ledger set credit_type = 'check' where credit_type is null;
alter table public.check_ledger alter column credit_type set not null;
alter table public.check_ledger alter column credit_type set default 'check';

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.check_ledger'::regclass and conname = 'check_ledger_entry_type_check') then
    raise exception 'expected constraint check_ledger_entry_type_check not found -- schema drifted from what this migration assumes';
  end if;
end $$;

alter table public.check_ledger drop constraint check_ledger_entry_type_check;
alter table public.check_ledger add constraint check_ledger_entry_type_check
  check (entry_type = any (array['purchased','used','refunded','expired','manual_adjustment','released']));

alter table public.check_ledger drop constraint if exists check_ledger_credit_type_check;
alter table public.check_ledger add constraint check_ledger_credit_type_check
  check (credit_type in ('check', 'keyword_scan'));

comment on column public.check_ledger.amount is
  'Signed delta. purchased: +N. used: always -1. refunded: -N. expired: -N. released: +1 if restored, 0 if the batch had already expired and could not be revived. manual_adjustment: either sign.';

-- ===========================================================================
-- SECTION D: stripe_webhook_events -- state machine, fencing token, safe backfill
-- ===========================================================================
alter table public.stripe_webhook_events
  add column if not exists event_type text,
  add column if not exists status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  add column if not exists attempt_count integer not null default 1 check (attempt_count > 0),
  add column if not exists claim_token uuid,
  add column if not exists first_received_at timestamptz not null default now(),
  add column if not exists last_attempted_at timestamptz not null default now(),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists error_category text;

-- E: strict, audited precondition -- NOT a broad "every null becomes
-- completed" conversion. Production's stripe_webhook_events holds exactly
-- ONE row (id 'evt_1U4ONvPoeQ54WTPbxXvOEva6', created 2026-08-14, verified
-- via a read-only query during this review), predating event_type tracking
-- and the entire check-pack system (2026-08-25). This block fails loudly
-- if that audited state no longer holds -- i.e. if more rows exist than
-- expected, or the specific known row is missing, this migration refuses
-- to guess and stops.
do $$
declare
  v_total_rows integer;
  v_known_row_exists boolean;
  v_unexpected_rows integer;
begin
  select count(*) into v_total_rows from public.stripe_webhook_events;
  select exists(select 1 from public.stripe_webhook_events where id = 'evt_1U4ONvPoeQ54WTPbxXvOEva6') into v_known_row_exists;
  select count(*) into v_unexpected_rows from public.stripe_webhook_events where id <> 'evt_1U4ONvPoeQ54WTPbxXvOEva6' and event_type is null;

  if v_total_rows = 0 then
    -- Nothing to backfill; NOT NULL below applies to zero rows, trivially safe.
    null;
  elsif v_total_rows = 1 and v_known_row_exists then
    update public.stripe_webhook_events
      set event_type = 'legacy_unclassified', status = 'completed', completed_at = coalesce(completed_at, created_at)
      where id = 'evt_1U4ONvPoeQ54WTPbxXvOEva6' and event_type is null;
  elsif v_unexpected_rows > 0 then
    raise exception 'stripe_webhook_events: % unexpected NULL-event_type row(s) beyond the audited known legacy row -- refusing to backfill blindly. Total rows: %', v_unexpected_rows, v_total_rows;
  end if;
  -- else: total_rows > 1 but all classified already (event_type already
  -- non-null from a prior partial run) -- fall through, NOT NULL enforced below.
end $$;

alter table public.stripe_webhook_events alter column event_type set not null;

do $$
declare v_still_null integer;
begin
  select count(*) into v_still_null from public.stripe_webhook_events where event_type is null;
  if v_still_null > 0 then raise exception 'stripe_webhook_events: % rows still have NULL event_type -- refusing to enforce NOT NULL', v_still_null; end if;
end $$;

comment on column public.stripe_webhook_events.error_category is
  'Sanitised category only (e.g. "signature_verification_failed", "fulfilment_conflict", "internal_error") -- never a raw error message.';
comment on column public.stripe_webhook_events.claim_token is
  'Fencing token. Set fresh on every successful claim/reclaim. complete_stripe_webhook_event and fail_stripe_webhook_event require the caller to present the exact token they were given -- a stale worker whose lease already expired and was reclaimed by another worker presents an old token, which no longer matches, and its completion/failure attempt is rejected as stale_claim rather than allowed to overwrite the reclaiming worker''s outcome.';

do $$
declare v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stripe_webhook_events' and column_name='first_received_at') then v_missing := v_missing || 'first_received_at'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stripe_webhook_events' and column_name='claim_token') then v_missing := v_missing || 'claim_token'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stripe_webhook_events' and column_name='lease_expires_at') then v_missing := v_missing || 'lease_expires_at'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stripe_webhook_events' and column_name='event_type' and is_nullable='NO') then v_missing := v_missing || 'event_type NOT NULL'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='stripe_webhook_events' and column_name='status' and column_default like '%processing%') then v_missing := v_missing || 'status default processing'; end if;
  if array_length(v_missing,1) > 0 then raise exception 'Section D incomplete: %', array_to_string(v_missing, ', '); end if;
end $$;

-- ===========================================================================
-- SECTION E: keyword_scan_reservations -- lease_expires_at, not last_attempted_at
-- ===========================================================================
create table if not exists public.keyword_scan_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  credit_source text not null check (credit_source in ('free', 'paid')),
  batch_id uuid references public.credit_batches (id),
  created_at timestamptz not null default now(),
  lease_expires_at timestamptz, -- C: fixed at creation, NEVER extended by any caller, client or edge function
  completed_at timestamptz,
  released_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  unique (user_id, idempotency_key),
  constraint keyword_scan_reservations_source_batch_check check (
    (credit_source = 'paid' and batch_id is not null) or (credit_source = 'free' and batch_id is null)
  ),
  constraint keyword_scan_reservations_completed_fields_check check (
    status <> 'completed' or (completed_at is not null and result_expires_at is not null)
  ),
  constraint keyword_scan_reservations_result_only_when_completed_check check (
    status = 'completed' or result is null
  ),
  constraint keyword_scan_reservations_released_no_result_check check (
    status <> 'released' or result is null
  ),
  constraint keyword_scan_reservations_reserved_has_lease_check check (
    status <> 'reserved' or lease_expires_at is not null
  )
);

comment on table public.keyword_scan_reservations is
  'State machine: reserved -> completed (terminal) | reserved -> released (terminal). lease_expires_at is set ONCE at creation to now() + a fixed duration (see reserve_keyword_scan) and is never updated by any subsequent call, including repeated reserve calls with the same key or client status polling -- only reconcile_abandoned_keyword_scan_reservations reads it, never writes it.';

create index if not exists keyword_scan_reservations_cleanup_idx
  on public.keyword_scan_reservations (result_expires_at) where result is not null;
create index if not exists keyword_scan_reservations_reconcile_idx
  on public.keyword_scan_reservations (lease_expires_at) where status = 'reserved';

alter table public.check_ledger add column if not exists keyword_scan_reservation_id uuid
  references public.keyword_scan_reservations(id);

create unique index if not exists check_ledger_reservation_used_unique_idx
  on public.check_ledger (keyword_scan_reservation_id) where entry_type = 'used' and keyword_scan_reservation_id is not null;
create unique index if not exists check_ledger_reservation_released_unique_idx
  on public.check_ledger (keyword_scan_reservation_id) where entry_type = 'released' and keyword_scan_reservation_id is not null;
create unique index if not exists check_ledger_batch_purchased_unique_idx
  on public.check_ledger (batch_id, credit_type) where entry_type = 'purchased';
create unique index if not exists check_ledger_batch_expired_unique_idx
  on public.check_ledger (batch_id, credit_type) where entry_type = 'expired';
create unique index if not exists check_ledger_batch_refunded_unique_idx
  on public.check_ledger (batch_id, credit_type) where entry_type = 'refunded';

alter table public.keyword_scan_reservations enable row level security;
revoke all on public.keyword_scan_reservations from public, anon, authenticated, service_role;

comment on column public.profiles.keyword_scans_consumed is
  'Frozen, read-only legacy offset: free Keyword Scan usage recorded before the reservation-based system took over. No code writes this column after cutover.';

do $$
declare v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='credit_source' and is_nullable='NO') then v_missing := v_missing || 'credit_source NOT NULL'; end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='lease_expires_at') then v_missing := v_missing || 'lease_expires_at'; end if;
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='last_attempted_at') then v_missing := v_missing || 'last_attempted_at must NOT exist (superseded by lease_expires_at)'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keyword_scan_reservations'::regclass and conname = 'keyword_scan_reservations_source_batch_check') then v_missing := v_missing || 'source_batch_check'; end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keyword_scan_reservations'::regclass and conname = 'keyword_scan_reservations_reserved_has_lease_check') then v_missing := v_missing || 'reserved_has_lease_check'; end if;
  if exists (select 1 from pg_policies where schemaname='public' and tablename='keyword_scan_reservations') then v_missing := v_missing || 'unexpected policy present (should be zero)'; end if;
  if array_length(v_missing,1) > 0 then raise exception 'Section E incomplete: %', array_to_string(v_missing, ', '); end if;
end $$;

-- ===========================================================================
-- SECTION F: refund_events
-- ===========================================================================
create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.credit_batches(id),
  user_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  stripe_refund_id text, -- G: the actual Stripe Refund object id (re_...), NEVER a Charge id (ch_...)
  attempt_number integer not null default 1,
  created_at timestamptz not null default now(),
  finalized_at timestamptz
);
revoke all on public.refund_events from public, anon, authenticated, service_role;

create unique index if not exists refund_events_one_active_pending_idx
  on public.refund_events (batch_id) where status = 'pending';
create index if not exists refund_events_batch_idx on public.refund_events (batch_id, created_at desc);

comment on column public.refund_events.stripe_refund_id is
  'Must be a Stripe Refund object id (prefix re_), obtained from stripe.refunds.create()''s own response or from re.status.succeeded''s object, or from a Charge''s refunds.data[].id -- never charge.id itself.';

do $$
declare v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='refund_events') then v_missing := v_missing || 'refund_events table'; end if;
  if not exists (select 1 from pg_indexes where schemaname='public' and tablename='refund_events' and indexname='refund_events_one_active_pending_idx') then v_missing := v_missing || 'one_active_pending_idx'; end if;
  if array_length(v_missing,1) > 0 then raise exception 'Section F incomplete: %', array_to_string(v_missing, ', '); end if;
end $$;

-- ===========================================================================
-- SECTION G: Stripe webhook claiming with fencing token (D)
-- ===========================================================================
create or replace function public.claim_stripe_webhook_event(p_event_id text, p_event_type text)
returns table(outcome text, claim_token uuid, attempt_count integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_lease constant interval := interval '5 minutes';
  v_existing public.stripe_webhook_events%rowtype;
  v_new_attempt integer;
  v_new_token uuid;
begin
  v_new_token := gen_random_uuid();

  insert into public.stripe_webhook_events (id, event_type, status, attempt_count, claim_token, first_received_at, last_attempted_at, lease_expires_at)
  values (p_event_id, p_event_type, 'processing', 1, v_new_token, now(), now(), now() + v_lease)
  on conflict (id) do nothing;

  if found then
    return query select 'claimed_new'::text, v_new_token, 1;
    return;
  end if;

  select * into v_existing from public.stripe_webhook_events where id = p_event_id for update;

  if v_existing.status = 'completed' then
    return query select 'already_completed'::text, null::uuid, v_existing.attempt_count;
    return;
  end if;

  if v_existing.status = 'failed' then
    v_new_attempt := v_existing.attempt_count + 1;
    update public.stripe_webhook_events
      set status = 'processing', attempt_count = v_new_attempt, claim_token = v_new_token,
          last_attempted_at = now(), lease_expires_at = now() + v_lease
      where id = p_event_id;
    return query select 'retry_claimed'::text, v_new_token, v_new_attempt;
    return;
  end if;

  -- status = 'processing': only reclaim if the lease has genuinely expired.
  if v_existing.lease_expires_at is not null and v_existing.lease_expires_at < now() then
    v_new_attempt := v_existing.attempt_count + 1;
    update public.stripe_webhook_events
      set attempt_count = v_new_attempt, claim_token = v_new_token,
          last_attempted_at = now(), lease_expires_at = now() + v_lease
      where id = p_event_id;
    return query select 'retry_claimed'::text, v_new_token, v_new_attempt;
    return;
  end if;

  return query select 'contention'::text, null::uuid, v_existing.attempt_count;
end;
$function$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;

create or replace function public.complete_stripe_webhook_event(p_event_id text, p_claim_token uuid)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.stripe_webhook_events
    set status = 'completed', completed_at = now()
    where id = p_event_id and status = 'processing' and claim_token = p_claim_token;

  if found then
    return query select 'completed'::text;
  else
    -- D: a stale worker whose lease was already reclaimed presents an old
    -- token that no longer matches -- rejected, never allowed to overwrite
    -- the reclaiming worker's own outcome.
    return query select 'stale_claim'::text;
  end if;
end;
$function$;
revoke all on function public.complete_stripe_webhook_event(text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.complete_stripe_webhook_event(text, uuid) to service_role;

create or replace function public.fail_stripe_webhook_event(p_event_id text, p_claim_token uuid, p_error_category text)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.stripe_webhook_events
    set status = 'failed', error_category = p_error_category
    where id = p_event_id and status = 'processing' and claim_token = p_claim_token;

  if found then
    return query select 'failed'::text;
  else
    return query select 'stale_claim'::text;
  end if;
end;
$function$;
revoke all on function public.fail_stripe_webhook_event(text, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.fail_stripe_webhook_event(text, uuid, text) to service_role;

-- ===========================================================================
-- SECTION H: grant_pack_credits -- verified facts, no timestamp fallback,
-- explicit fulfilment_conflict on either uniqueness collision
-- ===========================================================================
create or replace function public.grant_pack_credits(
  p_user_id uuid,
  p_pack_id text,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text,
  p_stripe_price_id text,
  p_amount_paid integer,
  p_currency text,
  p_quantity integer,
  p_paid_at timestamptz -- F: caller MUST supply a genuinely verified
                          -- successful-payment timestamp; this function
                          -- does not accept null and does not substitute
                          -- any other timestamp on the caller's behalf.
)
returns table(already_granted boolean, batch_id uuid, checks_granted integer, keyword_scans_granted integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_checks_amount integer;
  v_keyword_scans_amount integer;
  v_new_batch_id uuid;
  v_existing public.credit_batches%rowtype;
  v_expires_at timestamptz;
begin
  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then raise exception 'missing_fulfilment_identifier'; end if;
  if p_paid_at is null then raise exception 'missing_verified_paid_at'; end if;
  if p_stripe_price_id is null or p_amount_paid is null or p_currency is null or p_quantity is null then
    raise exception 'missing_verified_purchase_facts';
  end if;

  case p_pack_id
    when 'small' then v_checks_amount := 5; v_keyword_scans_amount := 5;
    when 'medium' then v_checks_amount := 15; v_keyword_scans_amount := 15;
    when 'large' then v_checks_amount := 40; v_keyword_scans_amount := 40;
    else raise exception 'unknown_pack_id: %', p_pack_id;
  end case;

  v_expires_at := p_paid_at + interval '90 days';

  -- Global lock order: profile first.
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  begin
    insert into public.credit_batches
      (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining,
       stripe_payment_intent_id, stripe_checkout_session_id, stripe_price_id, amount_paid, currency, quantity,
       paid_at, pack_id, expires_at)
    values
      (p_user_id, 'purchase', v_checks_amount, v_checks_amount, v_keyword_scans_amount, v_keyword_scans_amount,
       p_stripe_payment_intent_id, p_stripe_checkout_session_id, p_stripe_price_id, p_amount_paid, p_currency, p_quantity,
       p_paid_at, p_pack_id, v_expires_at)
    on conflict (stripe_payment_intent_id) do nothing
    returning id into v_new_batch_id;
  exception when unique_violation then
    -- F: a collision on the SEPARATE stripe_checkout_session_id unique
    -- index (structurally shouldn't happen -- would mean two different
    -- payment intents claim the same checkout session) is explicitly
    -- classified, never left to surface as a generic 500.
    raise exception 'fulfilment_conflict: checkout session % already associated with a different payment intent', p_stripe_checkout_session_id;
  end;

  if v_new_batch_id is not null then
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
    values
      (p_user_id, v_new_batch_id, 'purchased', v_checks_amount, 'check', p_stripe_payment_intent_id),
      (p_user_id, v_new_batch_id, 'purchased', v_keyword_scans_amount, 'keyword_scan', p_stripe_payment_intent_id)
    on conflict do nothing;

    update public.profiles set checks_balance = checks_balance + v_checks_amount where id = p_user_id;
    return query select false, v_new_batch_id, v_checks_amount, v_keyword_scans_amount;
    return;
  end if;

  -- Replay: compare EVERY immutable verified fact, including paid_at.
  select * into v_existing from public.credit_batches where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_existing.user_id <> p_user_id
     or v_existing.pack_id <> p_pack_id
     or v_existing.stripe_price_id is distinct from p_stripe_price_id
     or v_existing.amount_paid is distinct from p_amount_paid
     or v_existing.currency is distinct from p_currency
     or v_existing.quantity is distinct from p_quantity
     or v_existing.paid_at is distinct from p_paid_at
     or (v_existing.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id
         and v_existing.stripe_checkout_session_id is not null and p_stripe_checkout_session_id is not null)
  then
    raise exception 'fulfilment_conflict: payment_intent % already fulfilled with different verified facts', p_stripe_payment_intent_id;
  end if;

  return query select true, v_existing.id, v_existing.checks_granted, v_existing.keyword_scans_granted;
end;
$function$;

revoke all on function public.grant_pack_credits(uuid, text, text, text, text, integer, text, integer, timestamptz) from public, anon, authenticated, service_role;
grant execute on function public.grant_pack_credits(uuid, text, text, text, text, integer, text, integer, timestamptz) to service_role;

-- ===========================================================================
-- SECTION I: Keyword Scan reservation RPCs -- global lock order, fixed lease
-- ===========================================================================
create or replace function public.reserve_keyword_scan(p_idempotency_key text)
returns table(outcome text, reservation_id uuid, cached_result jsonb)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_lease_duration constant interval := interval '5 minutes';
  -- C: documented evidence -- extract-job-url's own worst-case is bounded
  -- (10s fetch timeout, shared across up to 5 redirect hops, so <=10s
  -- total); CV/JD file parsing is capped at 15s (PARSE_TIMEOUT_MS); the
  -- OpenAI call is capped at 20s (OPENAI_TIMEOUT_MS). Worst-case realistic
  -- end-to-end runtime is therefore well under 60 seconds. 5 minutes is a
  -- 5x safety margin over that worst case, while still releasing a
  -- genuinely abandoned reservation's credit reasonably promptly.
  v_existing_id uuid; -- non-locking read result
  v_row public.keyword_scan_reservations%rowtype;
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
  v_batch_id uuid;
  v_credit_source text;
  v_maintenance boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then
    raise exception 'invalid_idempotency_key';
  end if;

  -- Non-locking read to discover whether this key already has a row.
  select id into v_existing_id from public.keyword_scan_reservations
    where user_id = v_user_id and idempotency_key = p_idempotency_key;

  -- Global lock order: profile first, always.
  perform 1 from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_existing_id is not null then
    -- Lock the reservation (batch lock not needed on this path -- we are
    -- not mutating credit_batches here, only reading the reservation's
    -- own terminal/non-terminal state).
    select * into v_row from public.keyword_scan_reservations where id = v_existing_id for update;
    -- Re-validate: row must still exist (it will, rows are never deleted).
    if v_row.status = 'reserved' then
      -- C: NO lease renewal here. Repeated reserve with the same key never
      -- extends lease_expires_at.
      return query select 'already_processing'::text, v_row.id, null::jsonb;
      return;
    elsif v_row.status = 'completed' then
      if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
        return query select 'replay_result'::text, v_row.id, v_row.result;
      else
        return query select 'result_expired'::text, v_row.id, null::jsonb;
      end if;
      return;
    else
      return query select 'released'::text, v_row.id, null::jsonb;
      return;
    end if;
  end if;

  -- Genuinely new key. Maintenance check happens here, not before the
  -- existing-key lookup above, so an existing key's replay/status is never
  -- blocked by maintenance.
  select enabled into v_maintenance from public.feature_flags where key = 'keyword_scan_maintenance';
  if coalesce(v_maintenance, true) then -- fail CLOSED if the row is missing
    return query select 'service_unavailable'::text, null::uuid, null::jsonb;
    return;
  end if;

  -- Non-locking read to find a candidate batch, then lock it, then
  -- re-validate (global lock order: batch before reservation).
  select id into v_batch_id
    from public.credit_batches
    where user_id = v_user_id and keyword_scans_remaining > 0 and expires_at > now() and refund_status = 'active'
    order by expires_at asc
    limit 1;

  if v_batch_id is not null then
    perform 1 from public.credit_batches where id = v_batch_id for update;
    -- Re-validate under lock: could have been consumed or expired between
    -- the non-locking read above and acquiring the lock.
    if not exists (
      select 1 from public.credit_batches
      where id = v_batch_id and keyword_scans_remaining > 0 and expires_at > now() and refund_status = 'active'
    ) then
      v_batch_id := null; -- fall through to free-credit path below
    end if;
  end if;

  if v_batch_id is not null then
    v_credit_source := 'paid';
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining - 1 where id = v_batch_id;
  else
    select greatest(least(keyword_scans_consumed, v_free_limit), 0) into v_legacy_offset from public.profiles where id = v_user_id;
    select count(*) into v_new_free_used
      from public.keyword_scan_reservations
      where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');

    if greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0) > 0 then
      v_credit_source := 'free';
    else
      return query select 'no_credits'::text, null::uuid, null::jsonb;
      return;
    end if;
  end if;

  insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id, lease_expires_at)
  values (v_user_id, p_idempotency_key, 'reserved', v_credit_source, v_batch_id, now() + v_lease_duration)
  returning id into v_row.id;

  return query select 'reserved'::text, v_row.id, null::jsonb;
end;
$function$;

revoke all on function public.reserve_keyword_scan(text) from public, anon, authenticated, service_role;
grant execute on function public.reserve_keyword_scan(text) to authenticated;

create or replace function public.complete_keyword_scan(p_reservation_id uuid, p_result jsonb)
returns table(outcome text, cached_result jsonb, result_expires_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_preread public.keyword_scan_reservations%rowtype;
  v_row public.keyword_scan_reservations%rowtype;
  v_validated jsonb;
  v_result_ttl constant interval := interval '24 hours';
  v_match_percent int;
  v_matched_total int;
  v_missing_total int;
  v_matched jsonb;
  v_missing jsonb;
  v_elem jsonb;
  v_term text;
  v_normalized text;
  v_seen text[] := array[]::text[];
  v_valid boolean := true;
  v_max_terms constant integer := 20; -- I: matches the edge function's own OpenAI schema cap, not 200
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  -- Non-locking read to discover batch_id for correct lock ordering.
  select * into v_preread from public.keyword_scan_reservations where id = p_reservation_id and user_id = v_user_id;
  if not found then raise exception 'reservation_not_found'; end if;

  perform 1 from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_preread.credit_source = 'paid' and v_preread.batch_id is not null then
    perform 1 from public.credit_batches where id = v_preread.batch_id for update;
  end if;

  select * into v_row from public.keyword_scan_reservations where id = p_reservation_id and user_id = v_user_id for update;

  -- Re-validate: abort safely if state changed since the pre-read.
  if v_row.credit_source is distinct from v_preread.credit_source or v_row.batch_id is distinct from v_preread.batch_id then
    raise exception 'state_changed_retry';
  end if;

  if v_row.status = 'completed' then
    if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
      return query select 'already_completed'::text, v_row.result, v_row.result_expires_at;
    else
      return query select 'result_expired'::text, null::jsonb, null::timestamptz;
    end if;
    return;
  end if;
  if v_row.status = 'released' then raise exception 'reservation_already_released'; end if;
  if v_row.credit_source is null then raise exception 'reservation_missing_credit_source'; end if;

  -- ---- Validation: one concrete implementation ---------------------------
  if p_result is null or jsonb_typeof(p_result) <> 'object' then
    v_valid := false;
  else
    if exists (select key from jsonb_object_keys(p_result) as key
               where key not in ('match_percent','matched_total','missing_total','matched_terms','missing_terms')) then
      v_valid := false;
    elsif not (p_result ?& array['match_percent','matched_total','missing_total','matched_terms','missing_terms']) then
      v_valid := false;
    elsif jsonb_typeof(p_result->'match_percent') <> 'number'
       or jsonb_typeof(p_result->'matched_total') <> 'number'
       or jsonb_typeof(p_result->'missing_total') <> 'number' then
      v_valid := false;
    else
      begin
        v_match_percent := (p_result->>'match_percent')::int;
        v_matched_total := (p_result->>'matched_total')::int;
        v_missing_total := (p_result->>'missing_total')::int;
      exception when others then
        v_valid := false;
      end;
    end if;
  end if;

  if v_valid then
    v_matched := p_result->'matched_terms';
    v_missing := p_result->'missing_terms';
    if jsonb_typeof(v_matched) <> 'array' or jsonb_typeof(v_missing) <> 'array' then v_valid := false; end if;
  end if;

  if v_valid and (v_match_percent < 0 or v_match_percent > 100) then v_valid := false; end if;
  if v_valid and (v_matched_total < 0 or v_missing_total < 0) then v_valid := false; end if;
  if v_valid and (v_matched_total > v_max_terms or v_missing_total > v_max_terms) then v_valid := false; end if;
  if v_valid and (jsonb_array_length(v_matched) > 3 or jsonb_array_length(v_missing) > 3) then v_valid := false; end if;
  if v_valid and (jsonb_array_length(v_matched) > v_matched_total or jsonb_array_length(v_missing) > v_missing_total) then v_valid := false; end if;
  if v_valid and ((v_matched_total = 0) <> (jsonb_array_length(v_matched) = 0)) then v_valid := false; end if;
  if v_valid and ((v_missing_total = 0) <> (jsonb_array_length(v_missing) = 0)) then v_valid := false; end if;
  if v_valid and v_match_percent <> (
    case when (v_matched_total + v_missing_total) = 0 then 0
    else round((v_matched_total::numeric / (v_matched_total + v_missing_total)) * 100)::int end
  ) then v_valid := false; end if;

  if v_valid then
    for v_elem in select jsonb_array_elements(v_matched) union all select jsonb_array_elements(v_missing) loop
      if jsonb_typeof(v_elem) <> 'string' then v_valid := false; exit; end if;
    end loop;
  end if;

  if v_valid then
    v_seen := array[]::text[];
    for v_term in select jsonb_array_elements_text(v_matched) union all select jsonb_array_elements_text(v_missing) loop
      if v_term is null or length(trim(v_term)) = 0 or length(v_term) > 80 then v_valid := false; exit; end if;
      if v_term ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then v_valid := false; exit; end if;
      if regexp_replace(v_term, '\D', '', 'g') ~ '^[0-9]{7,}$' then v_valid := false; exit; end if;
      if v_term ~* 'https?://' then v_valid := false; exit; end if;
      v_normalized := lower(regexp_replace(trim(v_term), '\s+', ' ', 'g'));
      if v_normalized = any(v_seen) then v_valid := false; exit; end if;
      v_seen := v_seen || v_normalized;
    end loop;
  end if;

  if not v_valid then
    if v_row.credit_source = 'paid' and v_row.batch_id is not null then
      update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
        where id = v_row.batch_id and expires_at > now();
    end if;
    update public.keyword_scan_reservations set status = 'released', released_at = now() where id = v_row.id;
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
    values (v_user_id, v_row.batch_id, 'released', 1, 'keyword_scan', v_row.id, 'invalid model result, credit released')
    on conflict do nothing;
    return query select 'invalid_result'::text, null::jsonb, null::timestamptz;
    return;
  end if;

  -- Rebuild from validated scalars only.
  v_validated := jsonb_build_object(
    'match_percent', v_match_percent, 'matched_total', v_matched_total, 'missing_total', v_missing_total,
    'matched_terms', v_matched, 'missing_terms', v_missing
  );

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
  values (v_user_id, v_row.batch_id, 'used', -1, 'keyword_scan', v_row.id, 'reservation ' || v_row.id || ' (' || v_row.credit_source || ')')
  on conflict do nothing;

  update public.keyword_scan_reservations
    set status = 'completed', completed_at = now(), result = v_validated, result_expires_at = now() + v_result_ttl
    where id = v_row.id;

  return query select 'completed'::text, v_validated, (now() + v_result_ttl);
end;
$function$;

revoke all on function public.complete_keyword_scan(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.complete_keyword_scan(uuid, jsonb) to authenticated;

create or replace function public.release_keyword_scan_reservation(p_reservation_id uuid)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_preread public.keyword_scan_reservations%rowtype;
  v_row public.keyword_scan_reservations%rowtype;
  v_batch_expired boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_preread from public.keyword_scan_reservations where id = p_reservation_id and user_id = v_user_id;
  if not found then return query select 'reservation_not_found'::text; return; end if;

  perform 1 from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  if v_preread.credit_source = 'paid' and v_preread.batch_id is not null then
    perform 1 from public.credit_batches where id = v_preread.batch_id for update;
  end if;

  select * into v_row from public.keyword_scan_reservations where id = p_reservation_id and user_id = v_user_id for update;

  if v_row.status = 'completed' then return query select 'already_completed'::text; return; end if;
  if v_row.status = 'released' then return query select 'already_released'::text; return; end if;

  if v_row.credit_source = 'paid' and v_row.batch_id is not null then
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1 where id = v_row.batch_id and expires_at > now();
    if not found then v_batch_expired := true; end if;
  end if;

  update public.keyword_scan_reservations set status = 'released', released_at = now() where id = p_reservation_id;

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
  values (v_user_id, v_row.batch_id, 'released', case when v_batch_expired then 0 else 1 end, 'keyword_scan', v_row.id,
    case when v_batch_expired then 'batch expired during processing, not restored' else 'released' end)
  on conflict do nothing;

  return query select case when v_batch_expired then 'batch_expired_not_restored' else 'released' end;
end;
$function$;

revoke all on function public.release_keyword_scan_reservation(uuid) from public, anon, authenticated, service_role;
grant execute on function public.release_keyword_scan_reservation(uuid) to authenticated;

-- C: status-only polling, by idempotency key (preferred for lost-response
-- recovery), pure read, never touches lease_expires_at.
create or replace function public.poll_keyword_scan_status(p_idempotency_key text)
returns table(outcome text, reservation_id uuid, cached_result jsonb)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_row from public.keyword_scan_reservations where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if not found then return query select 'reservation_not_found'::text, null::uuid, null::jsonb; return; end if;

  if v_row.status = 'reserved' then
    return query select 'already_processing'::text, v_row.id, null::jsonb;
  elsif v_row.status = 'released' then
    return query select 'released'::text, v_row.id, null::jsonb;
  elsif v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
    return query select 'replay_result'::text, v_row.id, v_row.result;
  else
    return query select 'result_expired'::text, v_row.id, null::jsonb;
  end if;
end;
$function$;

revoke all on function public.poll_keyword_scan_status(text) from public, anon, authenticated, service_role;
grant execute on function public.poll_keyword_scan_status(text) to authenticated;

create or replace function public.reconcile_abandoned_keyword_scan_reservations()
returns table(reconciled_count integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row record;
  v_count integer := 0;
  v_batch_expired boolean;
begin
  for v_user_id in
    select distinct user_id from public.keyword_scan_reservations
    where status = 'reserved' and lease_expires_at < now()
    order by user_id
  loop
    perform 1 from public.profiles where id = v_user_id for update;

    for v_row in
      select id, credit_source, batch_id from public.keyword_scan_reservations
      where user_id = v_user_id and status = 'reserved' and lease_expires_at < now()
      order by id
      for update skip locked
    loop
      v_batch_expired := false;
      if v_row.credit_source = 'paid' and v_row.batch_id is not null then
        update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
          where id = v_row.batch_id and expires_at > now();
        if not found then v_batch_expired := true; end if;
      end if;

      update public.keyword_scan_reservations set status = 'released', released_at = now() where id = v_row.id;

      insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
      values (v_user_id, v_row.batch_id, 'released', case when v_batch_expired then 0 else 1 end, 'keyword_scan', v_row.id,
        case when v_batch_expired then 'reconciled: abandoned, batch expired, not restored' else 'reconciled: abandoned reservation auto-released' end)
      on conflict do nothing;

      v_count := v_count + 1;
    end loop;
  end loop;

  return query select v_count;
end;
$function$;

revoke all on function public.reconcile_abandoned_keyword_scan_reservations() from public, anon, authenticated, service_role;
grant execute on function public.reconcile_abandoned_keyword_scan_reservations() to service_role;

create or replace function public.get_credit_summary()
returns table(
  total_checks_available integer, paid_checks_available integer, free_checks_available integer,
  total_keyword_scans_available integer, paid_keyword_scans_available integer, free_keyword_scans_available integer,
  next_check_expiry timestamptz, next_check_expiry_amount integer,
  next_keyword_scan_expiry timestamptz, next_keyword_scan_expiry_amount integer
)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
  v_free_ks integer;
  v_free_checks integer;
  v_paid_checks integer;
  v_paid_ks integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  if not exists (select 1 from public.profiles where id = v_user_id) then raise exception 'profile_not_found'; end if;

  select greatest(least(keyword_scans_consumed, v_free_limit), 0), greatest(1 - lifetime_checks_consumed, 0)
    into v_legacy_offset, v_free_checks from public.profiles where id = v_user_id;

  select count(*) into v_new_free_used from public.keyword_scan_reservations
    where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');
  v_free_ks := greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0);

  select coalesce(sum(checks_remaining), 0), coalesce(sum(keyword_scans_remaining), 0)
    into v_paid_checks, v_paid_ks
    from public.credit_batches where user_id = v_user_id and expires_at > now() and refund_status = 'active';

  return query
  with next_check as (
    select expires_at, sum(checks_remaining) as amount from public.credit_batches
    where user_id = v_user_id and expires_at > now() and checks_remaining > 0 and refund_status = 'active'
    group by expires_at order by expires_at asc limit 1
  ),
  next_ks as (
    select expires_at, sum(keyword_scans_remaining) as amount from public.credit_batches
    where user_id = v_user_id and expires_at > now() and keyword_scans_remaining > 0 and refund_status = 'active'
    group by expires_at order by expires_at asc limit 1
  )
  select
    v_paid_checks + v_free_checks, v_paid_checks, v_free_checks,
    v_paid_ks + v_free_ks, v_paid_ks, v_free_ks,
    (select expires_at from next_check), (select amount::int from next_check),
    (select expires_at from next_ks), (select amount::int from next_ks);
end;
$function$;

revoke all on function public.get_credit_summary() from public, anon, authenticated, service_role;
grant execute on function public.get_credit_summary() to authenticated;

-- ===========================================================================
-- SECTION J: expiry, cleanup
-- ===========================================================================
create or replace function public.expire_credit_batches()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_batch record;
begin
  for v_user_id in
    select distinct user_id from public.credit_batches
    where expires_at is not null and expires_at < now() and (checks_remaining > 0 or keyword_scans_remaining > 0)
    order by user_id
  loop
    perform 1 from public.profiles where id = v_user_id for update;

    for v_batch in
      select id, checks_remaining, keyword_scans_remaining from public.credit_batches
      where user_id = v_user_id and expires_at is not null and expires_at < now() and (checks_remaining > 0 or keyword_scans_remaining > 0)
      order by id
      for update
    loop
      update public.credit_batches set checks_remaining = 0, keyword_scans_remaining = 0 where id = v_batch.id;
      update public.profiles set checks_balance = greatest(checks_balance - v_batch.checks_remaining, 0) where id = v_user_id;

      if v_batch.checks_remaining > 0 then
        insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
        values (v_user_id, v_batch.id, 'expired', -v_batch.checks_remaining, 'check') on conflict do nothing;
      end if;
      if v_batch.keyword_scans_remaining > 0 then
        insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
        values (v_user_id, v_batch.id, 'expired', -v_batch.keyword_scans_remaining, 'keyword_scan') on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$function$;

revoke all on function public.expire_credit_batches() from public, anon, authenticated, service_role;
-- J/L: cron-owner only, no grant to service_role -- documented intentional
-- use of PostgreSQL cron ownership rather than an application role, since
-- this function is invoked exclusively by pg_cron, never by any edge
-- function.

create or replace function public.cleanup_expired_keyword_scan_results()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.keyword_scan_reservations
    set result = null
    where result is not null and result_expires_at is not null and result_expires_at < now();
end;
$function$;

revoke all on function public.cleanup_expired_keyword_scan_results() from public, anon, authenticated, service_role;

-- ===========================================================================
-- SECTION K: Refund RPCs -- global lock order, versioned attempts,
-- ambiguous-failure safety, actual Refund ID
-- ===========================================================================
create or replace function public.reserve_refund(p_batch_id uuid)
returns table(outcome text, batch_id uuid, checks_granted integer, keyword_scans_granted integer, stripe_payment_intent_id text, refund_event_id uuid)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_preread public.credit_batches%rowtype;
  v_batch public.credit_batches%rowtype;
  v_guarantee_window constant interval := interval '7 days';
  v_active_reservations integer;
  v_refund_event_id uuid;
  v_next_attempt integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_preread from public.credit_batches where id = p_batch_id and user_id = v_user_id;
  if not found then
    return query select 'batch_not_found'::text, null::uuid, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  perform 1 from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  select * into v_batch from public.credit_batches where id = p_batch_id and user_id = v_user_id for update;

  if v_batch.refund_status <> 'active' then
    return query select ('already_' || v_batch.refund_status)::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;
  if v_batch.checks_remaining <> v_batch.checks_granted or v_batch.keyword_scans_remaining <> v_batch.keyword_scans_granted then
    return query select 'already_used'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;
  if now() - v_batch.granted_at > v_guarantee_window then
    return query select 'window_expired'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  select count(*) into v_active_reservations from public.keyword_scan_reservations where keyword_scan_reservations.batch_id = p_batch_id and status = 'reserved';
  if v_active_reservations > 0 then
    return query select 'active_reservation_exists'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  update public.credit_batches set refund_status = 'refund_pending' where id = p_batch_id;

  select coalesce(max(attempt_number), 0) + 1 into v_next_attempt from public.refund_events where refund_events.batch_id = p_batch_id;

  insert into public.refund_events (batch_id, user_id, status, attempt_number)
  values (p_batch_id, v_user_id, 'pending', v_next_attempt)
  returning id into v_refund_event_id;

  return query select 'reserved'::text, v_batch.id, v_batch.checks_granted, v_batch.keyword_scans_granted, v_batch.stripe_payment_intent_id, v_refund_event_id;
end;
$function$;

revoke all on function public.reserve_refund(uuid) from public, anon, authenticated, service_role;
grant execute on function public.reserve_refund(uuid) to authenticated;

create or replace function public.finalize_refund(p_refund_event_id uuid, p_stripe_refund_id text)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_preread public.refund_events%rowtype;
  v_event public.refund_events%rowtype;
  v_batch public.credit_batches%rowtype;
  v_checks_clawback integer;
begin
  select * into v_preread from public.refund_events where id = p_refund_event_id;
  if not found then raise exception 'refund_event_not_found'; end if;

  perform 1 from public.profiles where id = v_preread.user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  perform 1 from public.credit_batches where id = v_preread.batch_id for update;

  select * into v_event from public.refund_events where id = p_refund_event_id for update;

  if v_event.status = 'succeeded' then return query select 'already_finalized'::text; return; end if;
  if v_event.status = 'failed' then raise exception 'refund_event_already_failed'; end if;

  select * into v_batch from public.credit_batches where id = v_event.batch_id;
  v_checks_clawback := v_batch.checks_remaining;

  update public.credit_batches set checks_remaining = 0, keyword_scans_remaining = 0, refund_status = 'refunded' where id = v_batch.id;
  update public.profiles set checks_balance = greatest(checks_balance - v_checks_clawback, 0) where id = v_event.user_id;

  if v_checks_clawback > 0 then
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
    values (v_event.user_id, v_batch.id, 'refunded', -v_checks_clawback, 'check', v_batch.stripe_payment_intent_id) on conflict do nothing;
  end if;
  if v_batch.keyword_scans_remaining > 0 then
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
    values (v_event.user_id, v_batch.id, 'refunded', -v_batch.keyword_scans_remaining, 'keyword_scan', v_batch.stripe_payment_intent_id) on conflict do nothing;
  end if;

  update public.refund_events set status = 'succeeded', stripe_refund_id = p_stripe_refund_id, finalized_at = now() where id = p_refund_event_id;
  return query select 'finalized'::text;
end;
$function$;

create or replace function public.fail_refund(p_refund_event_id uuid)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_preread public.refund_events%rowtype;
  v_event public.refund_events%rowtype;
begin
  select * into v_preread from public.refund_events where id = p_refund_event_id;
  if not found then raise exception 'refund_event_not_found'; end if;

  perform 1 from public.profiles where id = v_preread.user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  perform 1 from public.credit_batches where id = v_preread.batch_id for update;

  select * into v_event from public.refund_events where id = p_refund_event_id for update;
  if v_event.status <> 'pending' then
    return query select ('already_' || v_event.status)::text;
    return;
  end if;

  -- G: a DEFINITE Stripe rejection is required to reach this function --
  -- callers must never invoke fail_refund merely on an ambiguous
  -- timeout/connection error. See edge function §G / reconcile_ambiguous_refunds.
  update public.credit_batches set refund_status = 'active' where id = v_event.batch_id and refund_status = 'refund_pending';
  update public.refund_events set status = 'failed', finalized_at = now() where id = p_refund_event_id;
  return query select 'failed_and_restored'::text;
end;
$function$;

revoke all on function public.finalize_refund(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.finalize_refund(uuid, text) to service_role;
revoke all on function public.fail_refund(uuid) from public, anon, authenticated, service_role;
grant execute on function public.fail_refund(uuid) to service_role;

create or replace function public.recover_external_refund(p_stripe_payment_intent_id text, p_stripe_refund_id text)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_preread public.credit_batches%rowtype;
  v_batch public.credit_batches%rowtype;
  v_refund_event_id uuid;
begin
  select * into v_preread from public.credit_batches where stripe_payment_intent_id = p_stripe_payment_intent_id;
  if not found then return query select 'batch_not_found'::text; return; end if;

  -- H: global order -- profile before batch, always, even on the external
  -- recovery path. No entry-point exception.
  perform 1 from public.profiles where id = v_preread.user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  perform 1 from public.credit_batches where id = v_preread.id for update;
  select * into v_batch from public.credit_batches where id = v_preread.id;

  if v_batch.refund_status = 'refunded' then
    return query select 'already_refunded'::text;
    return;
  end if;

  select id into v_refund_event_id from public.refund_events where batch_id = v_batch.id and status = 'pending';
  if v_refund_event_id is null then
    insert into public.refund_events (batch_id, user_id, status)
    values (v_batch.id, v_batch.user_id, 'pending')
    returning id into v_refund_event_id;
    update public.credit_batches set refund_status = 'refund_pending' where id = v_batch.id;
  end if;

  return query select outcome from public.finalize_refund(v_refund_event_id, p_stripe_refund_id) as outcome;
end;
$function$;

revoke all on function public.recover_external_refund(text, text) from public, anon, authenticated, service_role;
grant execute on function public.recover_external_refund(text, text) to service_role;

-- G: reconciliation for ambiguous refund attempts (Stripe timeout /
-- connection error during stripe.refunds.create, or delayed visibility).
create or replace function public.reconcile_ambiguous_refunds()
returns table(reconciled_count integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_count integer := 0;
begin
  -- This function only IDENTIFIES stuck-pending refund_events older than a
  -- grace period; the actual Stripe lookup and definitive
  -- finalize_refund/fail_refund call happens in the calling edge function
  -- (reconcile-ambiguous-refunds), which has Stripe API access this
  -- plpgsql function does not. This RPC returns the candidate list.
  return query
    select count(*)::integer from public.refund_events
    where status = 'pending' and created_at < now() - interval '2 minutes';
end;
$function$;

revoke all on function public.reconcile_ambiguous_refunds() from public, anon, authenticated, service_role;
grant execute on function public.reconcile_ambiguous_refunds() to service_role;

create or replace function public.list_ambiguous_refund_candidates()
returns table(refund_event_id uuid, stripe_payment_intent_id text)
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  return query
    select re.id, cb.stripe_payment_intent_id
    from public.refund_events re
    join public.credit_batches cb on cb.id = re.batch_id
    where re.status = 'pending' and re.created_at < now() - interval '2 minutes';
end;
$function$;

revoke all on function public.list_ambiguous_refund_candidates() from public, anon, authenticated, service_role;
grant execute on function public.list_ambiguous_refund_candidates() to service_role;

select cron.schedule('expire-credit-batches', '0 3 * * *', $$select public.expire_credit_batches()$$);
select cron.schedule('cleanup-expired-keyword-scan-results', '0 * * * *', $$select public.cleanup_expired_keyword_scan_results()$$);
select cron.schedule('reconcile-abandoned-keyword-scans', '*/10 * * * *', $$select public.reconcile_abandoned_keyword_scan_reservations()$$);

do $$
declare v_dup integer;
begin
  select count(*) into v_dup from (select jobname from cron.job group by jobname having count(*) > 1) x;
  if v_dup > 0 then raise exception 'cron.job has % duplicate jobname(s) after scheduling', v_dup; end if;
end $$;

commit;
