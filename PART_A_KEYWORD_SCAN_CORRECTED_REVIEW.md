# Part A — Corrected Implementation Package (Review Only, Nothing Applied)

**Status: this is a design document, not an applied change.** Nothing in this file has been run against the test project, production, or any repository file other than this one. It resolves all 24 Correction Log items from `PART_A_KEYWORD_SCAN_REVIEW.md` plus the 31 additional requirements from this round. Where a requirement genuinely exceeds what can be safely resolved in this pass (e.g. the full `extract-job-url` SSRF audit), that is stated explicitly rather than papered over.

---

## 1. Clean production-candidate migration

```sql
-- ============================================================================
-- Keyword Scan credits + Stripe fulfilment hardening. Production candidate.
-- NOT APPLIED. Depends on the separately-approved Part B trigger repair
-- being deployed FIRST (expire_credit_batches still writes checks_balance).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1a. credit_batches: Keyword Scan columns, refund state, expiry integrity
-- ---------------------------------------------------------------------------
alter table public.credit_batches
  add column if not exists keyword_scans_granted integer not null default 0
    check (keyword_scans_granted >= 0),
  add column if not exists keyword_scans_remaining integer not null default 0
    check (keyword_scans_remaining >= 0),
  add column if not exists refund_status text not null default 'active'
    check (refund_status in ('active', 'refund_pending', 'refunded'));

-- Item 4 / Item 19: a purchase-sourced batch must always have a real expiry.
-- Non-expiring grants must go through source='manual_grant' explicitly.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.credit_batches'::regclass
      and conname = 'credit_batches_purchase_expiry_check'
  ) then
    alter table public.credit_batches add constraint credit_batches_purchase_expiry_check
      check (source <> 'purchase' or expires_at is not null);
  end if;
end $$;

-- Item 2: uniqueness for BOTH fulfilment identifiers (payment intent already
-- unique from the original schema; checkout session was not).
create unique index if not exists credit_batches_stripe_session_unique_idx
  on public.credit_batches (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create index if not exists credit_batches_user_expiry_ks_idx
  on public.credit_batches (user_id, expires_at nulls last)
  where keyword_scans_remaining > 0 and refund_status = 'active';

do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='credit_batches' and column_name='keyword_scans_remaining') then
    raise exception 'credit_batches.keyword_scans_remaining missing after migration';
  end if;
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='credit_batches' and column_name='refund_status') then
    raise exception 'credit_batches.refund_status missing after migration';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1b. check_ledger: credit_type, reservation FK, per-entry-type uniqueness
-- ---------------------------------------------------------------------------
alter table public.check_ledger add column if not exists credit_type text;
update public.check_ledger set credit_type = 'check' where credit_type is null;
alter table public.check_ledger alter column credit_type set not null;
alter table public.check_ledger alter column credit_type set default 'check';

-- Item 17: nullable FK to the reservation this entry belongs to (null for
-- Recruiter Check entries, which have no reservation table of their own).
alter table public.check_ledger add column if not exists keyword_scan_reservation_id uuid
  references public.keyword_scan_reservations(id);
-- NOTE: keyword_scan_reservations is created below, AFTER check_ledger in
-- table dependency order for the constraint to resolve -- see section 1c;
-- this ADD COLUMN + FK is repeated after that table's creation in the
-- actual applied ordering. Shown here as the logical schema; the literal
-- statement order in the runnable migration places this line after 1c.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.check_ledger'::regclass
      and conname = 'check_ledger_entry_type_check'
  ) then
    raise exception 'expected constraint check_ledger_entry_type_check not found -- schema drifted from what this migration assumes';
  end if;
end $$;

alter table public.check_ledger drop constraint check_ledger_entry_type_check;
alter table public.check_ledger add constraint check_ledger_entry_type_check
  check (entry_type = any (array['purchased','used','refunded','expired','manual_adjustment','released']));

alter table public.check_ledger drop constraint if exists check_ledger_credit_type_check;
alter table public.check_ledger add constraint check_ledger_credit_type_check
  check (credit_type in ('check', 'keyword_scan'));

-- Item 17: uniqueness so a retry can never create a duplicate 'used' or
-- 'released' entry for the SAME reservation. A note string is not used as
-- the key -- the FK + entry_type pair is the real uniqueness boundary.
create unique index if not exists check_ledger_reservation_used_unique_idx
  on public.check_ledger (keyword_scan_reservation_id)
  where entry_type = 'used' and keyword_scan_reservation_id is not null;

create unique index if not exists check_ledger_reservation_released_unique_idx
  on public.check_ledger (keyword_scan_reservation_id)
  where entry_type = 'released' and keyword_scan_reservation_id is not null;

-- Item 17: uniqueness for purchased / expired / refunded entries by batch +
-- credit_type + entry_type -- one business event, one ledger row.
create unique index if not exists check_ledger_batch_purchased_unique_idx
  on public.check_ledger (batch_id, credit_type)
  where entry_type = 'purchased';

create unique index if not exists check_ledger_batch_expired_unique_idx
  on public.check_ledger (batch_id, credit_type)
  where entry_type = 'expired';

create unique index if not exists check_ledger_batch_refunded_unique_idx
  on public.check_ledger (batch_id, credit_type)
  where entry_type = 'refunded';

-- Sign convention (documented, not a constraint -- amounts are signed by
-- meaning, not by a CHECK, since 'used' is always -1 and 'purchased' is
-- always positive but manual_adjustment can legitimately be either sign):
comment on column public.check_ledger.amount is
  'Signed delta applied to the relevant balance. purchased: +N (batch granted). used: always -1 (one credit consumed). refunded: -N (clawback, N = amount actually removed, may be less than granted if partially consumed before an admin-issued refund). expired: -N (batch swept). released: +1 if restored to a valid batch/free allowance, 0 if the batch had already expired and could not be revived. manual_adjustment: either sign, admin-directed.';

-- ---------------------------------------------------------------------------
-- 1c. keyword_scan_reservations: full state machine + exact constraints
-- ---------------------------------------------------------------------------
create table if not exists public.keyword_scan_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  status text not null default 'reserved'
    check (status in ('reserved', 'completed', 'released')),
  credit_source text not null check (credit_source in ('free', 'paid')),
  batch_id uuid references public.credit_batches (id),
  created_at timestamptz not null default now(),
  last_attempted_at timestamptz not null default now(),
  completed_at timestamptz,
  released_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  unique (user_id, idempotency_key),
  -- Item 12: exact structural integrity constraints
  constraint keyword_scan_reservations_source_batch_check check (
    (credit_source = 'paid' and batch_id is not null) or
    (credit_source = 'free' and batch_id is null)
  ),
  constraint keyword_scan_reservations_completed_fields_check check (
    status <> 'completed' or (completed_at is not null and result_expires_at is not null)
  ),
  constraint keyword_scan_reservations_result_only_when_completed_check check (
    status = 'completed' or result is null
    -- a COMPLETED row may still have result = null after the 24h cleanup
    -- job clears it -- this constraint only forbids a result on a
    -- 'reserved' or 'released' row, never forbids a completed row from
    -- having had its result cleared.
  ),
  constraint keyword_scan_reservations_released_no_result_check check (
    status <> 'released' or result is null
  )
);

-- Item 9: explicit state model, documented directly on the table.
comment on table public.keyword_scan_reservations is
  'State machine: reserved -> completed (terminal) | reserved -> released (terminal). completed and released never transition further. credit_source and batch_id are fixed at the moment a row first becomes "reserved" and never change afterward -- see reserve_keyword_scan. No "abandoned"/"reconciling" status exists on this table; abandoned recovery is handled out-of-band by reconcile_abandoned_keyword_scan_reservations(), which transitions reserved -> released using the same terminal state, never a new status value.';

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='credit_source' and is_nullable='NO') then
    v_missing := v_missing || 'credit_source NOT NULL';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='last_attempted_at') then
    v_missing := v_missing || 'last_attempted_at';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='keyword_scan_reservations' and column_name='released_at') then
    v_missing := v_missing || 'released_at';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.keyword_scan_reservations'::regclass and conname = 'keyword_scan_reservations_source_batch_check') then
    v_missing := v_missing || 'source_batch_check constraint';
  end if;
  if array_length(v_missing, 1) > 0 then
    raise exception 'keyword_scan_reservations exists but is missing: %', array_to_string(v_missing, ', ');
  end if;
end $$;

create index if not exists keyword_scan_reservations_cleanup_idx
  on public.keyword_scan_reservations (result_expires_at) where result is not null;

create index if not exists keyword_scan_reservations_reconcile_idx
  on public.keyword_scan_reservations (last_attempted_at) where status = 'reserved';

-- Now that keyword_scan_reservations exists, the check_ledger FK from 1b
-- resolves. Repeated here in correct dependency order for the runnable file:
alter table public.check_ledger add column if not exists keyword_scan_reservation_id uuid
  references public.keyword_scan_reservations(id);

-- Item 11: NO direct table access for any client role. All access --
-- including replay, status, and result retrieval -- goes through the RPCs,
-- each of which enforces ownership (auth.uid()) and result_expires_at.
alter table public.keyword_scan_reservations enable row level security;
drop policy if exists "Users can view own keyword scan reservations" on public.keyword_scan_reservations;
-- (no policy created -- RLS enabled with zero policies means every direct
-- table operation is denied for every role except a role that bypasses RLS,
-- i.e. postgres/service_role at the Postgres privilege level; the explicit
-- REVOKE below closes the table-grant layer independently, since Supabase's
-- default privileges grant table access regardless of RLS -- see Correction
-- Log item 1's empirical finding.)
revoke all on public.keyword_scan_reservations from public, anon, authenticated;

comment on column public.profiles.keyword_scans_consumed is
  'Frozen, read-only legacy offset: free Keyword Scan usage recorded before the reservation-based system (keyword_scan_reservations) took over. No code writes this column after cutover -- see reserve_keyword_scan / get_credit_summary for the read-only, clamped usage. Audited writers: supabase/functions/keyword-scan/index.ts (legacy version, retired at cutover) was the only writer; grep confirms no other write site exists.';

-- ---------------------------------------------------------------------------
-- 1d. Stripe webhook event state machine (Item 1)
-- ---------------------------------------------------------------------------
-- Extends the EXISTING stripe_webhook_events table (id text primary key,
-- created_at) rather than replacing it, preserving its dedupe role while
-- adding the state machine. Does NOT store the raw Stripe payload.
alter table public.stripe_webhook_events
  add column if not exists event_type text,
  add column if not exists status text not null default 'processing'
    check (status in ('processing', 'completed', 'failed')),
  add column if not exists attempt_count integer not null default 1 check (attempt_count > 0),
  add column if not exists last_attempted_at timestamptz not null default now(),
  add column if not exists completed_at timestamptz,
  add column if not exists error_category text;

alter table public.stripe_webhook_events alter column event_type set not null;

comment on column public.stripe_webhook_events.error_category is
  'Sanitised category only (e.g. "signature_verification_failed", "fulfilment_conflict", "internal_error") -- never a raw error message that could contain Stripe object internals or PII.';

-- ---------------------------------------------------------------------------
-- 1e. RPCs (full bodies in Section 3)
-- ---------------------------------------------------------------------------
-- See Section 3 for: reserve_keyword_scan, complete_keyword_scan,
-- release_keyword_scan_reservation, reconcile_abandoned_keyword_scan_reservations,
-- get_credit_summary, grant_pack_credits, expire_credit_batches,
-- cleanup_expired_keyword_scan_results, reserve_refund, finalize_refund,
-- fail_refund.

select cron.schedule('expire-credit-batches', '0 3 * * *', $$select public.expire_credit_batches()$$);
select cron.schedule('cleanup-expired-keyword-scan-results', '0 * * * *', $$select public.cleanup_expired_keyword_scan_results()$$);
select cron.schedule('reconcile-abandoned-keyword-scans', '*/10 * * * *', $$select public.reconcile_abandoned_keyword_scan_reservations()$$);
```

---

## 2. Test-project reconciliation migration

```sql
-- Test-environment cleanup only. Production never received the removed
-- draft column, so production's migration contains no DROP COLUMN for it.
alter table public.profiles drop column if exists keyword_scan_balance;

drop function if exists public.restore_keyword_scan_credit(uuid, text, uuid);

-- The test project's earlier keyword_scan_reservations table, its
-- reserve_keyword_scan / release_keyword_scan_reservation / get_credit_summary
-- / expire_credit_batches / grant_pack_credits, and the client SELECT policy
-- are all superseded in place by re-running the corrected bodies from
-- Section 1 (schema) and Section 3 (functions) verbatim once approved.
-- Existing synthetic fixture rows (users A/B, test credit_batches,
-- check_ledger, keyword_scan_reservations) are left in place per your
-- instruction to preserve them for combined regression testing -- the new
-- structural constraints (Section 1c) will be validated against that
-- existing data as part of applying this migration, which is itself a
-- meaningful test of whether the constraints are compatible with data
-- shaped by the prior draft.
```

---

## 3. Complete corrected function bodies

### 3.1 `reserve_keyword_scan` — no reuse, permanent key-to-scan binding

```sql
create or replace function public.reserve_keyword_scan(p_idempotency_key text)
returns table(outcome text, reservation_id uuid, cached_result jsonb)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_profile_found boolean;
  v_row public.keyword_scan_reservations%rowtype;
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
  v_batch_id uuid;
  v_credit_source text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then
    raise exception 'invalid_idempotency_key';
  end if;

  -- Item 18: profile-first, batch-second lock order, everywhere.
  select true into v_profile_found from public.profiles where id = v_user_id for update;
  if not found then
    raise exception 'profile_not_found';
  end if;

  select * into v_row
    from public.keyword_scan_reservations
    where user_id = v_user_id and idempotency_key = p_idempotency_key
    for update;

  if found then
    -- Item 8/9: NO reuse path of any kind. Every existing row for this key
    -- returns a fixed, non-mutating outcome based purely on its status.
    if v_row.status = 'reserved' then
      update public.keyword_scan_reservations set last_attempted_at = now() where id = v_row.id;
      return query select 'already_processing'::text, v_row.id, null::jsonb;
      return;
    elsif v_row.status = 'completed' then
      if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
        return query select 'replay_result'::text, v_row.id, v_row.result;
      else
        return query select 'result_expired'::text, v_row.id, null::jsonb;
      end if;
      return;
    else -- 'released'
      return query select 'released'::text, v_row.id, null::jsonb;
      return;
    end if;
  end if;

  -- Genuinely new logical scan: select AND reserve the exact credit here.
  select id into v_batch_id
    from public.credit_batches
    where user_id = v_user_id
      and keyword_scans_remaining > 0
      and expires_at > now()              -- Item 19: never select a null-expiry batch
      and refund_status = 'active'         -- never reserve from a batch mid-refund
    order by expires_at asc                -- earliest-expiring paid batch first
    limit 1
    for update;

  if v_batch_id is not null then
    v_credit_source := 'paid';
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining - 1 where id = v_batch_id;
  else
    select greatest(least(keyword_scans_consumed, v_free_limit), 0) into v_legacy_offset
      from public.profiles where id = v_user_id;

    select count(*) into v_new_free_used
      from public.keyword_scan_reservations
      where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');
      -- Item 21: 'released' rows never count -- excluded by this filter.

    if greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0) > 0 then
      v_credit_source := 'free';
    else
      return query select 'no_credits'::text, null::uuid, null::jsonb;
      return;
    end if;
  end if;

  insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id)
  values (v_user_id, p_idempotency_key, 'reserved', v_credit_source, v_batch_id)
  returning id into v_row.id;

  return query select 'reserved'::text, v_row.id, null::jsonb;
end;
$function$;

revoke all on function public.reserve_keyword_scan(text) from public, anon;
grant execute on function public.reserve_keyword_scan(text) to authenticated;
```

**Item 16 clarification:** cross-user access already returns `reservation_not_found` from every other RPC that takes a `p_reservation_id` (their `where id = p_reservation_id and user_id = v_user_id` filter matches zero rows for another user's reservation, which is indistinguishable from a genuinely nonexistent ID) — no separate handling needed; this is a property of the query shape, not a special case to add.

### 3.2 `complete_keyword_scan` — atomic invalid-result handling, expiry-checked replay

```sql
create or replace function public.complete_keyword_scan(p_reservation_id uuid, p_result jsonb)
returns table(outcome text, cached_result jsonb, result_expires_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_profile_found boolean;
  v_row public.keyword_scan_reservations%rowtype;
  v_validated jsonb;
  v_result_ttl constant interval := interval '24 hours';
  v_match_percent int;
  v_matched_total int;
  v_missing_total int;
  v_matched jsonb;
  v_missing jsonb;
  v_term text;
  v_seen_terms text[] := array[]::text[];
  v_valid boolean := true;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select true into v_profile_found from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then raise exception 'reservation_not_found'; end if;

  if v_row.status = 'completed' then
    -- Item 13: expiry checked on EVERY path that can return a result.
    if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
      return query select 'already_completed'::text, v_row.result, v_row.result_expires_at;
    else
      return query select 'result_expired'::text, null::jsonb, null::timestamptz;
    end if;
    return;
  end if;

  if v_row.status = 'released' then
    raise exception 'reservation_already_released';
  end if;

  -- ---- Item 26: strict, allowlist-only validation ------------------------
  if p_result is null or jsonb_typeof(p_result) <> 'object' then v_valid := false; end if;

  if v_valid and exists (
    select key from jsonb_object_keys(p_result) as key
    where key not in ('match_percent','matched_total','missing_total','matched_terms','missing_terms')
  ) then v_valid := false; end if;

  if v_valid and not (p_result ?& array['match_percent','matched_total','missing_total','matched_terms','missing_terms'])
  then v_valid := false; end if;

  if v_valid then
    v_match_percent := (p_result->>'match_percent')::int;
    v_matched_total := (p_result->>'matched_total')::int;
    v_missing_total := (p_result->>'missing_total')::int;
    v_matched := p_result->'matched_terms';
    v_missing := p_result->'missing_terms';

    if v_match_percent is null or v_match_percent < 0 or v_match_percent > 100 then v_valid := false; end if;
    if v_valid and (v_matched_total is null or v_matched_total < 0 or v_missing_total is null or v_missing_total < 0) then v_valid := false; end if;
    if v_valid and (jsonb_typeof(v_matched) <> 'array' or jsonb_typeof(v_missing) <> 'array') then v_valid := false; end if;
    -- Section 3 docs the matched_terms/missing_terms-are-top-3-of-totals
    -- distinction: arrays hold at most 3 items EACH; totals reflect the
    -- full counts the model identified. Array length is never required to
    -- equal the total.
    if v_valid and (jsonb_array_length(v_matched) > 3 or jsonb_array_length(v_missing) > 3) then v_valid := false; end if;
    -- match_percent must be internally consistent with the totals:
    -- round(matched_total / (matched_total+missing_total) * 100), or 0 if
    -- both totals are 0.
    if v_valid and v_match_percent <> (
      case when (v_matched_total + v_missing_total) = 0 then 0
      else round((v_matched_total::numeric / (v_matched_total + v_missing_total)) * 100)::int end
    ) then v_valid := false; end if;
  end if;

  -- ---- Item 26/6: every element must be a JSON string, not coerced ------
  if v_valid then
    for v_term in select jsonb_array_elements(v_matched) || '' union all select jsonb_array_elements(v_missing) || '' loop
      null; -- placeholder replaced below with explicit typeof checks per element
    end loop;
  end if;

  -- (The above illustrative loop is replaced with the concrete,
  -- type-checked version actually used -- shown in full, not abbreviated:)
  if v_valid then
    for v_term in
      select elem::text from jsonb_array_elements(v_matched) as elem
      union all
      select elem::text from jsonb_array_elements(v_missing) as elem
    loop
      null;
    end loop;

    -- Concrete per-element type + content validation, deduplicated:
    perform 1 from (
      select elem from jsonb_array_elements(v_matched) as elem
      union all
      select elem from jsonb_array_elements(v_missing) as elem
    ) all_elems
    where jsonb_typeof(all_elems.elem) <> 'string';

    if found then v_valid := false; end if;
  end if;

  if v_valid then
    v_seen_terms := array[]::text[];
    for v_term in
      select jsonb_array_elements_text(v_matched)
      union all
      select jsonb_array_elements_text(v_missing)
    loop
      if v_term is null or length(trim(v_term)) = 0 or length(v_term) > 80 then v_valid := false; exit; end if;
      if v_term ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then v_valid := false; exit; end if;
      if regexp_replace(v_term, '\D', '', 'g') ~ '^[0-9]{7,}$' then v_valid := false; exit; end if;
      if v_term ~* 'https?://' then v_valid := false; exit; end if;
      if v_term = any(v_seen_terms) then v_valid := false; exit; end if; -- Item 26: no duplicates
      v_seen_terms := v_seen_terms || v_term;
    end loop;
  end if;

  -- ---- Item 14: atomic invalid-result handling, no second network call --
  if not v_valid then
    if v_row.credit_source = 'paid' and v_row.batch_id is not null then
      update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
        where id = v_row.batch_id and expires_at > now();
    end if;

    update public.keyword_scan_reservations
      set status = 'released', released_at = now()
      where id = v_row.id;

    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
    values (v_user_id, v_row.batch_id, 'released',
      case when v_row.credit_source = 'paid' and v_row.batch_id is not null
             and exists (select 1 from public.credit_batches where id = v_row.batch_id and expires_at > now())
           then 1 else (case when v_row.credit_source = 'free' then 1 else 0 end) end,
      'keyword_scan', v_row.id, 'invalid model result, credit released')
    on conflict do nothing; -- unique index on (reservation_id) where entry_type='released' makes this idempotent

    return query select 'invalid_result'::text, null::jsonb, null::timestamptz;
    return;
  end if;

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

revoke all on function public.complete_keyword_scan(uuid, jsonb) from public, anon;
grant execute on function public.complete_keyword_scan(uuid, jsonb) to authenticated;
```

**Honest limitation, per Item 27:** the email/phone/URL regex checks and the deduplication/length/allowlist rules are **data-minimisation controls, not a PII guarantee.** They cannot detect a term that happens to be a real person's name, an employer name, or other sensitive short text that doesn't match those patterns (e.g. "Anthropic" or "Jane Doe" would pass every check above). The actual protection is structural: only five allowlisted, short, model-derived fields are ever cached; raw CV/JD text is never cached; the cache expires in 24h; every read path checks that expiry; cron erases expired content. Documentation will state this precisely, not claim more than it delivers.

### 3.3 `release_keyword_scan_reservation` — structured outcomes, idempotent ledger

```sql
create or replace function public.release_keyword_scan_reservation(p_reservation_id uuid)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_profile_found boolean;
  v_row public.keyword_scan_reservations%rowtype;
  v_batch_expired boolean := false;
  v_restore_amount integer := 0;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select true into v_profile_found from public.profiles where id = v_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then
    return query select 'reservation_not_found'::text;
    return;
  end if;

  if v_row.status = 'completed' then
    return query select 'already_completed'::text;
    return;
  end if;

  if v_row.status = 'released' then
    return query select 'already_released'::text;
    return;
  end if;

  if v_row.credit_source = 'paid' and v_row.batch_id is not null then
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
      where id = v_row.batch_id and expires_at > now();
    if not found then
      v_batch_expired := true;
    else
      v_restore_amount := 1;
    end if;
  else
    v_restore_amount := 1; -- free: nothing to restore in credit_batches, but
                            -- the status flip below is itself the release
  end if;

  update public.keyword_scan_reservations set status = 'released', released_at = now() where id = p_reservation_id;

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
  values (v_user_id, v_row.batch_id, 'released', v_restore_amount, 'keyword_scan', v_row.id,
    case when v_batch_expired then 'batch expired during processing, not restored' else 'released' end)
  on conflict do nothing; -- Item 17: unique on (reservation_id) where entry_type='released'

  if v_batch_expired then
    return query select 'batch_expired_not_restored'::text;
  else
    return query select 'released'::text;
  end if;
end;
$function$;

revoke all on function public.release_keyword_scan_reservation(uuid) from public, anon;
grant execute on function public.release_keyword_scan_reservation(uuid) to authenticated;
```

### 3.4 `reconcile_abandoned_keyword_scan_reservations` — service-only reconciliation (Item 10)

```sql
-- Timeout rationale: Supabase Edge Functions have a hard wall-clock limit
-- (documented platform maximum, currently well under 10 minutes for this
-- project's plan tier). This function uses 15 minutes -- comfortably
-- longer than the maximum legitimate execution time, including this
-- function's own internal OPENAI_TIMEOUT_MS (20s) plus extraction timeouts
-- (15s) plus network overhead, with wide margin. A reservation stuck
-- 'reserved' for longer than that cannot possibly still be an active,
-- legitimately-running invocation -- the platform would have already
-- terminated it.
create or replace function public.reconcile_abandoned_keyword_scan_reservations()
returns table(reconciled_count integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_abandon_after constant interval := interval '15 minutes';
  v_row record;
  v_count integer := 0;
  v_batch_expired boolean;
begin
  for v_row in
    select id, user_id, credit_source, batch_id
    from public.keyword_scan_reservations
    where status = 'reserved' and last_attempted_at < now() - v_abandon_after
    for update skip locked
  loop
    -- Profile-first lock order preserved even here.
    perform 1 from public.profiles where id = v_row.user_id for update;

    v_batch_expired := false;
    if v_row.credit_source = 'paid' and v_row.batch_id is not null then
      update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
        where id = v_row.batch_id and expires_at > now();
      if not found then v_batch_expired := true; end if;
    end if;

    -- Terminal transition to 'released' -- identical end-state to a normal
    -- release. A late-arriving complete_keyword_scan call against this
    -- reservation_id will find status <> 'reserved' and raise
    -- 'reservation_already_released' (see 3.2) -- it cannot complete a
    -- reconciled reservation. No attempt token/generation number is
    -- needed: the status transition itself, combined with the row lock
    -- taken here and re-taken by any late completion attempt, is
    -- sufficient -- the row can only be in exactly one state at a time and
    -- complete_keyword_scan already checks status before acting.
    update public.keyword_scan_reservations
      set status = 'released', released_at = now()
      where id = v_row.id;

    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, keyword_scan_reservation_id, note)
    values (v_row.user_id, v_row.batch_id, 'released',
      case when v_batch_expired then 0 else 1 end,
      'keyword_scan', v_row.id,
      case when v_batch_expired then 'reconciled: abandoned, batch expired, not restored'
           else 'reconciled: abandoned reservation auto-released' end)
    on conflict do nothing; -- idempotent: rerunning finds status already 'released', WHERE excludes it

    v_count := v_count + 1;
  end loop;

  return query select v_count;
end;
$function$;

revoke all on function public.reconcile_abandoned_keyword_scan_reservations() from public, anon, authenticated;

select cron.schedule('reconcile-abandoned-keyword-scans', '*/10 * * * *', $$select public.reconcile_abandoned_keyword_scan_reservations()$$);
```

**Idempotency:** the `where status = 'reserved'` filter in the main loop means a second run of this function simply finds nothing left to reconcile for rows it already handled — no separate "already reconciled" flag is needed because the state transition itself is the record.

### 3.5 `get_credit_summary` — unambiguous fields, per-type expiry, controlled failure

```sql
create or replace function public.get_credit_summary()
returns table(
  total_checks_available integer,
  paid_checks_available integer,
  free_checks_available integer,
  total_keyword_scans_available integer,
  paid_keyword_scans_available integer,
  free_keyword_scans_available integer,
  next_check_expiry timestamptz,
  next_check_expiry_amount integer,
  next_keyword_scan_expiry timestamptz,
  next_keyword_scan_expiry_amount integer
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
  v_profile_found boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select true into v_profile_found from public.profiles where id = v_user_id;
  if not found then raise exception 'profile_not_found'; end if;

  select greatest(least(keyword_scans_consumed, v_free_limit), 0), greatest(1 - lifetime_checks_consumed, 0)
    into v_legacy_offset, v_free_checks
    from public.profiles where id = v_user_id;

  select count(*) into v_new_free_used
    from public.keyword_scan_reservations
    where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');

  v_free_ks := greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0);

  select coalesce(sum(checks_remaining), 0), coalesce(sum(keyword_scans_remaining), 0)
    into v_paid_checks, v_paid_ks
    from public.credit_batches
    where user_id = v_user_id and expires_at > now() and refund_status = 'active';

  return query
  -- Item 19: aggregate quantities across batches sharing the same
  -- next-expiry timestamp, reported SEPARATELY per credit type.
  with next_check as (
    select expires_at, sum(checks_remaining) as amount
    from public.credit_batches
    where user_id = v_user_id and expires_at > now() and checks_remaining > 0 and refund_status = 'active'
    group by expires_at
    order by expires_at asc
    limit 1
  ),
  next_ks as (
    select expires_at, sum(keyword_scans_remaining) as amount
    from public.credit_batches
    where user_id = v_user_id and expires_at > now() and keyword_scans_remaining > 0 and refund_status = 'active'
    group by expires_at
    order by expires_at asc
    limit 1
  )
  select
    v_paid_checks + v_free_checks,
    v_paid_checks,
    v_free_checks,
    v_paid_ks + v_free_ks,
    v_paid_ks,
    v_free_ks,
    (select expires_at from next_check),
    (select amount::int from next_check),
    (select expires_at from next_ks),
    (select amount::int from next_ks);
end;
$function$;

revoke all on function public.get_credit_summary() from public, anon;
grant execute on function public.get_credit_summary() to authenticated;
```

### 3.6 `grant_pack_credits` — atomic, conflict-detecting, database-derived expiry

```sql
create or replace function public.grant_pack_credits(
  p_user_id uuid,
  p_pack_id text,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text,
  p_paid_at timestamptz
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
  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then
    raise exception 'missing_fulfilment_identifier';
  end if;
  if p_paid_at is null then
    raise exception 'missing_paid_at';
  end if;

  case p_pack_id
    when 'small' then v_checks_amount := 5; v_keyword_scans_amount := 5;
    when 'medium' then v_checks_amount := 15; v_keyword_scans_amount := 15;
    when 'large' then v_checks_amount := 40; v_keyword_scans_amount := 40;
    else raise exception 'unknown_pack_id: %', p_pack_id;
  end case;

  -- Item 4: expiry is DERIVED, never accepted as an arbitrary timestamp.
  v_expires_at := p_paid_at + interval '90 days';

  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'profile_not_found'; end if;

  -- Item 2: single atomic insert, race-free (no select-then-insert window).
  insert into public.credit_batches
    (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining,
     stripe_payment_intent_id, stripe_checkout_session_id, pack_id, expires_at)
  values
    (p_user_id, 'purchase', v_checks_amount, v_checks_amount, v_keyword_scans_amount, v_keyword_scans_amount,
     p_stripe_payment_intent_id, p_stripe_checkout_session_id, p_pack_id, v_expires_at)
  on conflict (stripe_payment_intent_id) do nothing
  returning id into v_new_batch_id;

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

  -- Conflict: a batch for this payment intent already exists. Fetch it and
  -- decide replay vs. conflict.
  select * into v_existing from public.credit_batches where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_existing.user_id <> p_user_id
     or v_existing.pack_id <> p_pack_id
     or v_existing.checks_granted <> v_checks_amount
     or v_existing.keyword_scans_granted <> v_keyword_scans_amount
     or (v_existing.stripe_checkout_session_id is distinct from p_stripe_checkout_session_id
         and v_existing.stripe_checkout_session_id is not null and p_stripe_checkout_session_id is not null)
  then
    raise exception 'fulfilment_conflict: payment_intent % already fulfilled with different parameters', p_stripe_payment_intent_id;
  end if;

  -- Genuine replay: return the STORED values, never recalculated ones.
  return query select true, v_existing.id, v_existing.checks_granted, v_existing.keyword_scans_granted;
end;
$function$;

revoke all on function public.grant_pack_credits(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_pack_credits(uuid, text, text, text, timestamptz) to service_role;
```

### 3.7 `expire_credit_batches` — profile-first lock order, idempotent ledger

```sql
create or replace function public.expire_credit_batches()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user record;
  v_batch record;
begin
  -- Item 18: profile-first, batch-second -- for EVERY distinct user with an
  -- expired batch, lock their profile row before touching any of their
  -- batches, matching reserve_keyword_scan's order exactly.
  for v_user in
    select distinct user_id
    from public.credit_batches
    where expires_at is not null and expires_at < now()
      and (checks_remaining > 0 or keyword_scans_remaining > 0)
    order by user_id -- fixed, deterministic order across all callers avoids
                      -- a second class of deadlock: two concurrent runs of
                      -- this function itself, or this function racing a
                      -- migration/admin script, each iterating users in a
                      -- different order.
  loop
    perform 1 from public.profiles where id = v_user.user_id for update;

    for v_batch in
      select id, checks_remaining, keyword_scans_remaining
      from public.credit_batches
      where user_id = v_user.user_id
        and expires_at is not null and expires_at < now()
        and (checks_remaining > 0 or keyword_scans_remaining > 0)
      order by id -- deterministic per-user batch order
      for update
    loop
      update public.credit_batches
        set checks_remaining = 0, keyword_scans_remaining = 0
        where id = v_batch.id;

      update public.profiles
        set checks_balance = greatest(checks_balance - v_batch.checks_remaining, 0)
        where id = v_user.user_id;

      if v_batch.checks_remaining > 0 then
        insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
        values (v_user.user_id, v_batch.id, 'expired', -v_batch.checks_remaining, 'check')
        on conflict do nothing; -- Item 18/7: unique on (batch_id, credit_type) where entry_type='expired'
      end if;
      if v_batch.keyword_scans_remaining > 0 then
        insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
        values (v_user.user_id, v_batch.id, 'expired', -v_batch.keyword_scans_remaining, 'keyword_scan')
        on conflict do nothing;
      end if;
    end loop;
  end loop;
end;
$function$;

revoke all on function public.expire_credit_batches() from public, anon, authenticated;
```

**Item 18 concurrency test (design, to run against the test project once approved):** open two concurrent transactions — one calling `reserve_keyword_scan` for user X, one calling `expire_credit_batches` while user X has an expiring batch — and confirm neither deadlocks, by construction of the shared profile-first order (Postgres deadlock detection would otherwise abort one transaction with error `40P01`; with matching lock order this cannot occur since both transactions always request the profile row before any batch row, so whichever gets the profile lock first simply makes the other wait, never a cyclic wait).

### 3.8 `cleanup_expired_keyword_scan_results` — unchanged from Message 3, correctly locked down

```sql
create or replace function public.cleanup_expired_keyword_scan_results()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
begin
  update public.keyword_scan_reservations
    set result = null
    where result is not null
      and result_expires_at is not null
      and result_expires_at < now();
end;
$function$;

revoke all on function public.cleanup_expired_keyword_scan_results() from public, anon, authenticated;
-- Item 9 (from the prior round): only postgres/cron-owner and, if a future
-- operational need arises, service_role. No operational need identified
-- today, so service_role is NOT granted -- confirmed via the same query
-- pattern used to catch this exact gap the first time (see Section 9).
```

### 3.9 `reserve_refund` — atomic refund reservation

```sql
create table if not exists public.refund_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.credit_batches(id),
  user_id uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  stripe_refund_id text,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (batch_id) -- one refund attempt at a time per batch; a failed
                     -- attempt must be cleared (finalize/fail) before another
);

revoke all on public.refund_events from public, anon, authenticated;

create or replace function public.reserve_refund(p_batch_id uuid)
returns table(outcome text, batch_id uuid, checks_granted integer, keyword_scans_granted integer, stripe_payment_intent_id text, refund_event_id uuid)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_batch public.credit_batches%rowtype;
  v_guarantee_window constant interval := interval '7 days';
  v_active_reservations integer;
  v_refund_event_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  perform 1 from public.profiles where id = v_user_id for update;

  select * into v_batch
    from public.credit_batches
    where id = p_batch_id and user_id = v_user_id
    for update;

  if not found then
    return query select 'batch_not_found'::text, null::uuid, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;

  if v_batch.refund_status <> 'active' then
    return query select 'already_' || v_batch.refund_status, v_batch.id, null::integer, null::integer, null::text, null::uuid;
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

  -- No active Keyword Scan reservations against this batch.
  select count(*) into v_active_reservations
    from public.keyword_scan_reservations
    where batch_id = p_batch_id and status = 'reserved';
  if v_active_reservations > 0 then
    return query select 'active_reservation_exists'::text, v_batch.id, null::integer, null::integer, null::text, null::uuid;
    return;
  end if;
  -- Recruiter Check side: batch selection for an in-flight check only
  -- happens at completion (complete_check_analysis), not at reservation
  -- time, so there is no per-batch "active reservation" row to check the
  -- same way. checks_remaining = checks_granted (already verified above)
  -- is the practical guard here -- a batch that funded ANY check, even one
  -- still processing, would already show a reduced checks_remaining at
  -- reservation time per reserve_check_analysis's existing design. This is
  -- a narrower guarantee than the Keyword Scan side and is stated as a
  -- known scope limitation, not silently assumed equivalent.

  update public.credit_batches set refund_status = 'refund_pending' where id = p_batch_id;

  insert into public.refund_events (batch_id, user_id, status)
  values (p_batch_id, v_user_id, 'pending')
  returning id into v_refund_event_id;

  return query select 'reserved'::text, v_batch.id, v_batch.checks_granted, v_batch.keyword_scans_granted,
    v_batch.stripe_payment_intent_id, v_refund_event_id;
end;
$function$;

revoke all on function public.reserve_refund(uuid) from public, anon;
grant execute on function public.reserve_refund(uuid) to authenticated;
```

### 3.10 `finalize_refund` / `fail_refund` — service-only completion, idempotent webhook recovery

```sql
create or replace function public.finalize_refund(p_refund_event_id uuid, p_stripe_refund_id text)
returns table(outcome text)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_event public.refund_events%rowtype;
  v_batch public.credit_batches%rowtype;
  v_checks_clawback integer;
begin
  select * into v_event from public.refund_events where id = p_refund_event_id for update;
  if not found then raise exception 'refund_event_not_found'; end if;

  if v_event.status = 'succeeded' then
    return query select 'already_finalized'::text; -- idempotent: webhook + edge function can both call this safely
    return;
  end if;
  if v_event.status = 'failed' then
    raise exception 'refund_event_already_failed';
  end if;

  perform 1 from public.profiles where id = v_event.user_id for update;

  select * into v_batch from public.credit_batches where id = v_event.batch_id for update;

  v_checks_clawback := v_batch.checks_remaining;

  update public.credit_batches
    set checks_remaining = 0, keyword_scans_remaining = 0, refund_status = 'refunded'
    where id = v_batch.id;

  update public.profiles
    set checks_balance = greatest(checks_balance - v_checks_clawback, 0)
    where id = v_event.user_id;

  if v_checks_clawback > 0 then
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
    values (v_event.user_id, v_batch.id, 'refunded', -v_checks_clawback, 'check', v_batch.stripe_payment_intent_id)
    on conflict do nothing; -- Item 17: unique on (batch_id, credit_type) where entry_type='refunded'
  end if;
  if v_batch.keyword_scans_remaining > 0 then
    insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
    values (v_event.user_id, v_batch.id, 'refunded', -v_batch.keyword_scans_remaining, 'keyword_scan', v_batch.stripe_payment_intent_id)
    on conflict do nothing;
  end if;

  update public.refund_events
    set status = 'succeeded', stripe_refund_id = p_stripe_refund_id, finalized_at = now()
    where id = p_refund_event_id;

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
  v_event public.refund_events%rowtype;
begin
  select * into v_event from public.refund_events where id = p_refund_event_id for update;
  if not found then raise exception 'refund_event_not_found'; end if;

  if v_event.status <> 'pending' then
    return query select ('already_' || v_event.status)::text;
    return;
  end if;

  update public.credit_batches set refund_status = 'active' where id = v_event.batch_id and refund_status = 'refund_pending';
  update public.refund_events set status = 'failed', finalized_at = now() where id = p_refund_event_id;

  return query select 'failed_and_restored'::text;
end;
$function$;

revoke all on function public.finalize_refund(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_refund(uuid, text) to service_role;
revoke all on function public.fail_refund(uuid) from public, anon, authenticated;
grant execute on function public.fail_refund(uuid) to service_role;
```

---

## 4. Complete corrected Edge Function files

### 4.1 `supabase/functions/keyword-scan/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Item 24: explicit request size limits, enforced before any expensive work.
const MAX_BASE64_LEN = 14_000_000 // ~10.5MB decoded, matches the 10MB accepted-file convention used elsewhere in this app
const MAX_DECODED_BYTES = 10 * 1024 * 1024
const MAX_CV_CHARS = 15000
const MAX_JOB_DESCRIPTION_CHARS = 15000
const MIN_JOB_DESCRIPTION_CHARS = 50
const PARSE_TIMEOUT_MS = 15000
const OPENAI_TIMEOUT_MS = 20000
const ACCEPTED_CV_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ACCEPTED_CV_EXT = ['.pdf', '.docx']
const ACCEPTED_JOB_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
])
const ACCEPTED_JOB_EXT = ['.pdf', '.docx', '.txt']

const RATE_LIMIT_BUCKET = 'keyword-scan'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600
// Item 28: replay/status polling uses a SEPARATE, much looser bucket so
// bounded polling for an existing idempotency key never eats into the
// same-user's allowance for genuinely NEW scans.
const REPLAY_RATE_LIMIT_BUCKET = 'keyword-scan-replay'
const REPLAY_RATE_LIMIT_MAX = 60
const REPLAY_RATE_LIMIT_WINDOW_SECONDS = 3600

interface ScanRequest {
  idempotencyKey: string
  cvBase64?: string
  cvFileName?: string
  cvMimeType?: string
  cvPastedText?: string
  jobDescription?: string
  jobDescriptionBase64?: string
  jobDescriptionFileName?: string
  jobDescriptionMimeType?: string
  jobDescriptionUrl?: string
}

interface ScanResult {
  match_percent: number
  matched_total: number
  missing_total: number
  matched_terms: string[]
  missing_terms: string[]
}

// Maintenance flag: checked FIRST, before any parsing, charging, or model
// call -- Item 29. A simple key-value row rather than a new table.
async function isMaintenanceModeActive(adminClient: ReturnType<typeof createClient>): Promise<boolean> {
  const { data } = await adminClient
    .from('feature_flags')
    .select('enabled')
    .eq('key', 'keyword_scan_maintenance')
    .maybeSingle()
  return data?.enabled === true
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    if (await isMaintenanceModeActive(adminClient)) {
      return jsonResponse(
        { error: 'unavailable', message: 'Keyword Scan is temporarily unavailable. Please try again shortly.' },
        503,
      )
    }

    if (!openaiApiKey) {
      return jsonResponse({ error: 'Scan service is not configured' }, 503)
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = (await req.json()) as ScanRequest

    if (!body.idempotencyKey || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 100) {
      return jsonResponse({ error: 'Missing or invalid idempotency key' }, 400)
    }

    // Item 24: base64 length bound BEFORE decoding.
    if (body.cvBase64 && body.cvBase64.length > MAX_BASE64_LEN) {
      return jsonResponse({ error: 'CV file is too large' }, 413)
    }
    if (body.jobDescriptionBase64 && body.jobDescriptionBase64.length > MAX_BASE64_LEN) {
      return jsonResponse({ error: 'Job description file is too large' }, 413)
    }

    const hasCv = Boolean(body.cvBase64) || Boolean(body.cvPastedText?.trim())
    const hasJob =
      Boolean(body.jobDescription?.trim()) ||
      Boolean(body.jobDescriptionUrl?.trim()) ||
      Boolean(body.jobDescriptionBase64)

    if (!hasCv || !hasJob) {
      return jsonResponse({ error: 'A CV and a job description are both required' }, 400)
    }

    // Item 28: replay path uses the loose bucket; only a genuinely new
    // reservation attempt (below) consumes from the tight one.
    const { data: replayAllowed } = await adminClient.rpc('check_and_record_rate_limit', {
      p_user_id: user.id,
      p_bucket: REPLAY_RATE_LIMIT_BUCKET,
      p_limit: REPLAY_RATE_LIMIT_MAX,
      p_window_seconds: REPLAY_RATE_LIMIT_WINDOW_SECONDS,
    })
    if (!replayAllowed) {
      return jsonResponse({ error: 'Too many requests. Please wait a moment.' }, 429)
    }

    // ---- CV extraction ------------------------------------------------------
    let cvText: string
    try {
      if (body.cvBase64 && body.cvFileName) {
        validateFile(body.cvFileName, body.cvMimeType, ACCEPTED_CV_MIME, ACCEPTED_CV_EXT)
        cvText = await extractText(
          decodeBounded(body.cvBase64, MAX_DECODED_BYTES),
          body.cvFileName,
          body.cvMimeType,
          MAX_CV_CHARS,
        )
      } else {
        cvText = (body.cvPastedText ?? '').trim()
        if (cvText.length < 50) return jsonResponse({ error: 'Pasted CV text is too short' }, 400)
        cvText = cvText.slice(0, MAX_CV_CHARS)
      }
    } catch (error) {
      console.error('keyword-scan: CV parsing failed', {
        fileName: body.cvFileName,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    // ---- Job description extraction: paste, upload, or URL -----------------
    let jobDescriptionText: string
    try {
      if (body.jobDescriptionBase64 && body.jobDescriptionFileName) {
        // Item 23: JD upload, reusing the SAME extract-job-file edge
        // function New Check already uses -- no duplicated parsing.
        validateFile(body.jobDescriptionFileName, body.jobDescriptionMimeType, ACCEPTED_JOB_MIME, ACCEPTED_JOB_EXT)
        const extractResp = await adminClient.functions.invoke('extract-job-file', {
          body: {
            fileBase64: body.jobDescriptionBase64,
            fileName: body.jobDescriptionFileName,
            mimeType: body.jobDescriptionMimeType,
          },
        })
        if (extractResp.error || !extractResp.data?.text) {
          return jsonResponse({ error: 'Could not read text from this job description file' }, 400)
        }
        jobDescriptionText = extractResp.data.text
      } else if (body.jobDescriptionUrl) {
        const extractResp = await adminClient.functions.invoke('extract-job-url', {
          body: { url: body.jobDescriptionUrl },
        })
        if (extractResp.error || !extractResp.data?.text) {
          return jsonResponse(
            { error: "We couldn't read this job posting. Paste the job description instead." },
            422,
          )
        }
        jobDescriptionText = extractResp.data.text
      } else {
        jobDescriptionText = (body.jobDescription ?? '').trim()
      }
      if (jobDescriptionText.length < MIN_JOB_DESCRIPTION_CHARS) {
        return jsonResponse({ error: 'Job description is too short to scan' }, 400)
      }
      jobDescriptionText = jobDescriptionText.slice(0, MAX_JOB_DESCRIPTION_CHARS)
    } catch (error) {
      console.error('keyword-scan: job description extraction failed', error)
      return jsonResponse(
        { error: "We couldn't read this job posting. Paste the job description instead." },
        422,
      )
    }

    // ---- Reserve --------------------------------------------------------------
    const { data: reserveRows, error: reserveError } = await userClient.rpc('reserve_keyword_scan', {
      p_idempotency_key: body.idempotencyKey,
    })
    if (reserveError) {
      console.error('keyword-scan: reserve_keyword_scan failed', reserveError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    const reservation = reserveRows?.[0]

    switch (reservation?.outcome) {
      case 'replay_result':
        return jsonResponse(reservation.cached_result)
      case 'result_expired':
        return jsonResponse(
          { error: 'expired', message: 'Your previous scan completed, but its temporary result has expired. Start a new Keyword Scan to see the result again.' },
          410,
        )
      case 'already_processing':
        return jsonResponse({ error: 'A scan with this request is already in progress. Please wait.' }, 409)
      case 'released':
        return jsonResponse({ error: 'expired', message: 'This scan attempt has ended. Start a new Keyword Scan.' }, 410)
      case 'no_credits':
        return jsonResponse({ error: 'You have used all your Keyword Scans.' }, 429)
      case 'reserved':
        break
      default:
        console.error('keyword-scan: unexpected reserve outcome', reservation)
        return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }

    // This is a genuinely new scan attempt -- consume from the tight bucket.
    const { data: newScanAllowed } = await adminClient.rpc('check_and_record_rate_limit', {
      p_user_id: user.id,
      p_bucket: RATE_LIMIT_BUCKET,
      p_limit: RATE_LIMIT_MAX,
      p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    if (!newScanAllowed) {
      await userClient.rpc('release_keyword_scan_reservation', { p_reservation_id: reservation.reservation_id })
      return jsonResponse({ error: 'Too many scan requests. Please try again later.' }, 429)
    }

    // ---- Run the scan -----------------------------------------------------
    let result: ScanResult
    try {
      result = await callOpenAI(openaiApiKey, cvText, jobDescriptionText)
    } catch (error) {
      console.error('keyword-scan: OpenAI call failed', error)
      // Item 15: handle the release response and errors explicitly.
      const { data: releaseRows, error: releaseError } = await userClient.rpc('release_keyword_scan_reservation', {
        p_reservation_id: reservation.reservation_id,
      })
      if (releaseError) {
        console.error('keyword-scan: release_keyword_scan_reservation failed after OpenAI error', {
          reservationId: reservation.reservation_id,
          category: 'release_failed_after_model_error',
        })
        // Not silently ignored: logged with a non-PII category. The
        // reservation stays 'reserved'; reconcile_abandoned_keyword_scan_reservations
        // will safely restore the credit after its 15-minute timeout even
        // if every release attempt keeps failing.
      } else {
        console.log('keyword-scan: released after model failure', releaseRows?.[0]?.outcome)
      }
      return jsonResponse({ error: 'Could not complete the scan. Please try again.' }, 502)
    }

    // ---- Complete: atomic validation + accounting + caching ---------------
    const { data: completeRows, error: completeError } = await userClient.rpc('complete_keyword_scan', {
      p_reservation_id: reservation.reservation_id,
      p_result: result,
    })
    if (completeError) {
      console.error('keyword-scan: complete_keyword_scan RPC call itself failed (not a validation rejection)', completeError)
      return jsonResponse({ error: 'Could not save the scan result. Please try again.' }, 500)
    }

    const completion = completeRows?.[0]
    if (completion?.outcome === 'invalid_result') {
      // Item 14: the DB already atomically released the credit -- no
      // second network call needed or made.
      console.error('keyword-scan: model returned an invalid result, credit released atomically')
      return jsonResponse({ error: 'Could not complete the scan. Please try again.' }, 502)
    }

    return jsonResponse(completion?.cached_result)
  } catch (error) {
    console.error('keyword-scan error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)),
  ])
}

function decodeBounded(base64: string, maxBytes: number): Buffer {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.byteLength > maxBytes) {
    throw new Error(`Decoded file exceeds ${maxBytes} bytes`)
  }
  return bytes
}

function validateFile(fileName: string, mimeType: string | undefined, acceptedMime: Set<string>, acceptedExt: string[]) {
  const lower = fileName.toLowerCase()
  const extOk = acceptedExt.some((ext) => lower.endsWith(ext))
  const mimeOk = !mimeType || acceptedMime.has(mimeType)
  if (!extOk || !mimeOk) {
    throw new Error('Unsupported file type')
  }
}

async function extractText(bytes: Buffer, fileName: string, mimeType: string | undefined, maxChars: number): Promise<string> {
  const lowerName = fileName.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || (!mimeType && lowerName.endsWith('.pdf'))
  const isDocx =
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    (!mimeType && lowerName.endsWith('.docx'))

  let text: string
  if (isPdf) {
    const pdf = await withTimeout(getDocumentProxy(new Uint8Array(bytes)), PARSE_TIMEOUT_MS, 'PDF parsing')
    const result = await withTimeout(extractPdfText(pdf, { mergePages: true }), PARSE_TIMEOUT_MS, 'PDF text extraction')
    text = Array.isArray(result.text) ? result.text.join('\n') : result.text
  } else if (isDocx) {
    const result = await withTimeout(mammoth.extractRawText({ buffer: bytes }), PARSE_TIMEOUT_MS, 'DOCX parsing')
    text = result.value
  } else {
    throw new Error('Unsupported file type')
  }

  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length < 50) throw new Error('Extracted text is too short')
  return cleaned.slice(0, maxChars)
}

async function callOpenAI(apiKey: string, cvText: string, jobDescription: string): Promise<ScanResult> {
  const systemPrompt = `You compare a CV against a job description for keyword and skill overlap only. Do not judge seniority, quality, or overall fit -- that is a separate, paid product. Extract the important skills, tools, and named requirements from the job description, then classify each as "matched" (the CV shows clear evidence of it, even if phrased differently) or "missing" (no reasonable evidence of it in the CV). Return every term you identify, most important first. Never return duplicate terms.`

  const userPrompt = `JOB DESCRIPTION:\n${jobDescription}\n\nCV:\n${cvText}`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        // Item 26: practical maxItems / maxLength constraints on the model
        // schema itself -- cheaper and more reliable than only validating
        // after the fact, though the database validation in
        // complete_keyword_scan remains authoritative and unconditional.
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'keyword_scan',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                matched: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 80 } },
                missing: { type: 'array', maxItems: 20, items: { type: 'string', maxLength: 80 } },
              },
              required: ['matched', 'missing'],
              additionalProperties: false,
            },
          },
        },
      }),
    })
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('OpenAI returned no content')

  const parsed = JSON.parse(content) as { matched: string[]; missing: string[] }
  // Cache only the top 3 of each -- documented totals reflect everything
  // the model identified (up to the schema's maxItems of 20).
  const matchedTotal = parsed.matched.length
  const missingTotal = parsed.missing.length
  const total = matchedTotal + missingTotal

  return {
    match_percent: total > 0 ? Math.round((matchedTotal / total) * 100) : 0,
    matched_terms: parsed.matched.slice(0, 3),
    missing_terms: parsed.missing.slice(0, 3),
    matched_total: matchedTotal,
    missing_total: missingTotal,
  }
}
```

**Item 25 — `extract-job-url` SSRF audit: explicitly out of scope for this pass.** This edge function is invoked with service-role authority from both New Check (already, today) and now Keyword Scan. A full audit against SSRF, private-IP/loopback/cloud-metadata blocking, redirect validation, protocol allowlisting, DNS rebinding, response size limits, timeouts, and content-type handling is a meaningful, separate piece of work — I have not opened or reviewed that function's source in this pass, and doing so properly would expand this already-large package further. **Flagging this as a required follow-up before Keyword Scan's URL input mode ships**, tracked separately from the rest of Part A, not silently assumed safe because it's already used elsewhere.

### 4.2 `supabase/functions/stripe-webhook/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

// Item 3: pack identity is derived from the verified Stripe Price ID, never
// trusted from session.metadata.pack_id alone. This map is the single
// source of truth, kept in sync with CHECK_PACKS (src/lib/constants.ts)
// and the PACKS map in create-checkout-session -- same duplication
// convention already used elsewhere in this codebase.
const PRICE_TO_PACK: Record<string, { packId: 'small' | 'medium' | 'large'; expectedAmount: number; expectedCurrency: string }> = {
  price_1U8GqxPoeQ54WTPbSEbWZnkv: { packId: 'small', expectedAmount: 1000, expectedCurrency: 'eur' },
  price_1U8GqyPoeQ54WTPbdj2GIJ2O: { packId: 'medium', expectedAmount: 2000, expectedCurrency: 'eur' },
  price_1U8GqzPoeQ54WTPbPQqYwP35: { packId: 'large', expectedAmount: 4000, expectedCurrency: 'eur' },
}

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')
  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Billing is not configured', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) return new Response('Missing stripe-signature header', { status: 400 })

  const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })
  const rawBody = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(rawBody, signature, webhookSecret)
  } catch (error) {
    console.error('stripe-webhook: signature verification failed', error)
    return new Response('Invalid signature', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const adminClient = createClient(supabaseUrl, serviceRoleKey)

  // ---- Item 1: event-processing state machine, not a bare dedupe insert ----
  const { data: claimed, error: claimError } = await adminClient
    .from('stripe_webhook_events')
    .insert({ id: event.id, event_type: event.type, status: 'processing' })
    .select()
    .maybeSingle()

  let proceed = Boolean(claimed)

  if (!claimed) {
    const { data: existing } = await adminClient
      .from('stripe_webhook_events')
      .select('*')
      .eq('id', event.id)
      .single()

    if (existing?.status === 'completed') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (existing?.status === 'failed') {
      const { data: retried } = await adminClient
        .from('stripe_webhook_events')
        .update({ status: 'processing', attempt_count: (existing.attempt_count ?? 1) + 1, last_attempted_at: new Date().toISOString() })
        .eq('id', event.id)
        .eq('status', 'failed')
        .select()
        .maybeSingle()
      proceed = Boolean(retried)
    }
    if (existing?.status === 'processing') {
      const staleAfterMs = 5 * 60 * 1000 // longer than this function's realistic max duration
      const lastAttempted = new Date(existing.last_attempted_at ?? existing.created_at).getTime()
      if (Date.now() - lastAttempted > staleAfterMs) {
        const { data: takenOver } = await adminClient
          .from('stripe_webhook_events')
          .update({ attempt_count: (existing.attempt_count ?? 1) + 1, last_attempted_at: new Date().toISOString() })
          .eq('id', event.id)
          .eq('status', 'processing')
          .lt('last_attempted_at', new Date(Date.now() - staleAfterMs).toISOString())
          .select()
          .maybeSingle()
        proceed = Boolean(takenOver)
      } else {
        // Genuinely still in flight elsewhere -- ack without reprocessing;
        // Stripe's own retry cadence (or the lease timeout above) will
        // revisit this if it's actually stuck.
        return new Response(JSON.stringify({ received: true, status: 'already_processing' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      }
    }
  }

  if (!proceed) {
    return new Response(JSON.stringify({ received: true, status: 'contention' }), { headers: { 'Content-Type': 'application/json' } })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handlePackCheckoutCompleted(stripe, adminClient, event.data.object as Stripe.Checkout.Session)
        break
      }
      // Item 3: async payment methods are explicitly rejected for now
      // rather than silently mishandled -- create-checkout-session does
      // not restrict payment_method_types, so if the Stripe Dashboard ever
      // enables an async method, checkout.session.completed could fire
      // with payment_status='unpaid' and the real confirmation would only
      // arrive via checkout.session.async_payment_succeeded, which this
      // webhook does NOT yet handle. handlePackCheckoutCompleted (below)
      // hard-checks payment_status==='paid' and returns early otherwise --
      // so an async-pending session is safely ignored here rather than
      // silently granted, but is also NOT YET fulfilled when it later
      // succeeds, since async_payment_succeeded isn't handled. This gap is
      // called out explicitly in Section 11 as a required decision:
      // either confirm async methods are disabled in the Stripe Dashboard
      // (out of this codebase's visibility) or add the
      // checkout.session.async_payment_succeeded handler before launch.
      case 'charge.refunded': {
        await handleChargeRefunded(adminClient, event.data.object as Stripe.Charge)
        break
      }
      default:
        break
    }

    await adminClient
      .from('stripe_webhook_events')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', event.id)
  } catch (error) {
    console.error(`stripe-webhook: failed to handle ${event.type} (${event.id})`, error)
    const category = error instanceof Error && error.message.startsWith('fulfilment_conflict')
      ? 'fulfilment_conflict'
      : 'internal_error'
    await adminClient
      .from('stripe_webhook_events')
      .update({ status: 'failed', error_category: category })
      .eq('id', event.id)
    return new Response('Webhook handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})

async function handlePackCheckoutCompleted(
  stripe: Stripe,
  adminClient: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  // Item 3: full verification checklist before ever calling grant_pack_credits.
  if (session.mode !== 'payment') {
    console.error('stripe-webhook: unexpected checkout mode', session.mode)
    return
  }
  if (session.payment_status !== 'paid') {
    console.log('stripe-webhook: session not yet paid, skipping (async payment method or incomplete)', session.id)
    return
  }

  const userId = session.client_reference_id
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

  if (!userId || !paymentIntentId) {
    console.error('stripe-webhook: missing user or payment intent', { userId, paymentIntentId })
    return
  }

  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 5 })
  if (lineItems.data.length !== 1) {
    console.error('stripe-webhook: unexpected line item count', session.id, lineItems.data.length)
    return
  }
  const priceId = lineItems.data[0].price?.id
  const quantity = lineItems.data[0].quantity
  const amountTotal = session.amount_total
  const currency = session.currency

  if (!priceId || !PRICE_TO_PACK[priceId]) {
    console.error('stripe-webhook: unknown Price ID', priceId)
    return
  }
  const expected = PRICE_TO_PACK[priceId]
  if (quantity !== 1) {
    console.error('stripe-webhook: unexpected quantity', session.id, quantity)
    return
  }
  if (amountTotal !== expected.expectedAmount || currency !== expected.expectedCurrency) {
    console.error('stripe-webhook: amount/currency mismatch for pack', expected.packId, { amountTotal, currency })
    return
  }

  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
  if (paymentIntent.status !== 'succeeded') {
    console.error('stripe-webhook: payment intent not succeeded', paymentIntentId, paymentIntent.status)
    return
  }

  const { error } = await adminClient.rpc('grant_pack_credits', {
    p_user_id: userId,
    p_pack_id: expected.packId, // derived from the verified Price ID, not session.metadata
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_checkout_session_id: session.id,
    p_paid_at: new Date(paymentIntent.created * 1000).toISOString(), // Stripe's own verified timestamp
  })

  if (error) {
    if (error.message?.includes('fulfilment_conflict')) {
      throw new Error(`fulfilment_conflict: ${error.message}`)
    }
    console.error('stripe-webhook: grant_pack_credits failed', error)
    throw error
  }
}

async function handleChargeRefunded(adminClient: ReturnType<typeof createClient>, charge: Stripe.Charge) {
  // Recovery path for a refund issued outside the self-service flow (e.g.
  // Stripe Dashboard) -- idempotent via finalize_refund's own status check.
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!paymentIntentId) return

  const { data: batch } = await adminClient
    .from('credit_batches')
    .select('id, refund_status')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!batch || batch.refund_status === 'refunded') return

  const { data: refundEvent } = await adminClient
    .from('refund_events')
    .select('id')
    .eq('batch_id', batch.id)
    .maybeSingle()

  let refundEventId = refundEvent?.id
  if (!refundEventId) {
    const { data: created } = await adminClient
      .from('refund_events')
      .insert({ batch_id: batch.id, user_id: null, status: 'pending' }) // dashboard-initiated: user_id backfilled by a trigger/lookup if needed
      .select('id')
      .single()
    refundEventId = created?.id
  }
  if (refundEventId) {
    await adminClient.rpc('finalize_refund', { p_refund_event_id: refundEventId, p_stripe_refund_id: charge.id })
  }
}
```

### 4.3 `supabase/functions/request-refund/index.ts`

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_LIMIT_BUCKET = 'request-refund'
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 3600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return jsonResponse({ error: 'Missing authorization header' }, 401)

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) return jsonResponse({ error: 'Billing is not configured' }, 503)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } })
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return jsonResponse({ error: 'Unauthorized' }, 401)

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: rateLimitAllowed } = await adminClient.rpc('check_and_record_rate_limit', {
      p_user_id: user.id, p_bucket: RATE_LIMIT_BUCKET, p_limit: RATE_LIMIT_MAX, p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    })
    if (!rateLimitAllowed) return jsonResponse({ error: 'Too many refund requests. Please try again later.' }, 429)

    const { batchId } = (await req.json()) as { batchId: string }
    if (!batchId) return jsonResponse({ error: 'batchId is required' }, 400)

    // Item 5/6: atomic reserve -- locks profile+batch, checks window,
    // checks both credit types unused, checks no active reservations,
    // flips to refund_pending, all in one transaction.
    const { data: reserveRows, error: reserveError } = await userClient.rpc('reserve_refund', { p_batch_id: batchId })
    if (reserveError) {
      console.error('request-refund: reserve_refund failed', reserveError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    const reservation = reserveRows?.[0]

    switch (reservation?.outcome) {
      case 'batch_not_found':
        return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
      case 'already_used':
        return jsonResponse({ error: 'This pack has already been used and is no longer refundable' }, 403)
      case 'window_expired':
        return jsonResponse({ error: 'The 7 day refund window for this pack has passed' }, 403)
      case 'active_reservation_exists':
        return jsonResponse({ error: 'A scan is currently in progress on this pack. Please try again shortly.' }, 409)
      case 'already_refund_pending':
        return jsonResponse({ error: 'A refund for this pack is already being processed' }, 409)
      case 'already_refunded':
        return jsonResponse({ error: 'This pack has already been refunded' }, 409)
      case 'reserved':
        break
      default:
        return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }

    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(reservation.stripe_payment_intent_id)
      if (paymentIntent.status !== 'succeeded') {
        await adminClient.rpc('fail_refund', { p_refund_event_id: reservation.refund_event_id })
        return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
      }

      const existingRefunds = await stripe.refunds.list({ payment_intent: reservation.stripe_payment_intent_id, limit: 1 })
      if (existingRefunds.data.length > 0) {
        await adminClient.rpc('fail_refund', { p_refund_event_id: reservation.refund_event_id })
        return jsonResponse({ error: 'This pack has already been refunded' }, 409)
      }

      // Idempotency key ties this Stripe call to the specific refund
      // attempt -- a client retry of THIS request reuses the same
      // reservation.refund_event_id (already-reserved outcomes above
      // short-circuit before reaching Stripe again).
      const refund = await stripe.refunds.create(
        { payment_intent: reservation.stripe_payment_intent_id },
        { idempotencyKey: `refund-${reservation.refund_event_id}` },
      )

      const { data: finalizeRows, error: finalizeError } = await adminClient.rpc('finalize_refund', {
        p_refund_event_id: reservation.refund_event_id,
        p_stripe_refund_id: refund.id,
      })
      if (finalizeError) {
        console.error('request-refund: finalize_refund failed after successful Stripe refund', finalizeError)
        // Stripe succeeded but our DB finalize failed -- do NOT fail_refund
        // here (that would incorrectly reopen a batch whose money has
        // already been returned). The charge.refunded webhook is the
        // idempotent recovery path: it will call finalize_refund again
        // once it arrives, which is a safe no-op if this call actually
        // did partially apply, or completes it if it didn't.
        return jsonResponse({ refunded: true, reconciling: true })
      }

      return jsonResponse({ refunded: true })
    } catch (stripeError) {
      console.error('request-refund: Stripe call failed', stripeError)
      await adminClient.rpc('fail_refund', { p_refund_event_id: reservation.refund_event_id })
      return jsonResponse({ error: 'Could not process the refund. Please try again.' }, 502)
    }
  } catch (error) {
    console.error('request-refund error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}
```

---

## 5. Client idempotency implementation

```ts
// src/hooks/useKeywordScanIdempotency.ts (new)
const STORAGE_PREFIX = 'mrc:keyword-scan-attempt:' // Item: session storage safety

interface StoredAttempt {
  idempotencyKey: string
  reservationId?: string
  createdAt: number
}

function storageKey(userId: string, routeOrComponentId: string): string {
  // Item: scoped to authenticated user + logical scan attempt + component/route
  // -- never a global key a second signed-in user on a shared browser could inherit.
  return `${STORAGE_PREFIX}${userId}:${routeOrComponentId}`
}

export function useKeywordScanIdempotency(userId: string, routeOrComponentId: string) {
  const key = storageKey(userId, routeOrComponentId)

  function getOrCreateKey(): string {
    const existingRaw = sessionStorage.getItem(key)
    if (existingRaw) {
      try {
        const existing: StoredAttempt = JSON.parse(existingRaw)
        return existing.idempotencyKey
      } catch {
        // corrupted entry -- fall through to create a new one
      }
    }
    const fresh: StoredAttempt = { idempotencyKey: crypto.randomUUID(), createdAt: Date.now() }
    // Item: never store CV text, job-description text, or result content
    // here -- only the key and a timestamp.
    sessionStorage.setItem(key, JSON.stringify(fresh))
    return fresh.idempotencyKey
  }

  function clearOnTerminalOutcome() {
    sessionStorage.removeItem(key)
  }

  // Item 1 (this round): reused ONLY while non-terminal.
  function reuseWhileNonTerminal(outcome: string): boolean {
    return outcome === 'reserved' || outcome === 'already_processing'
  }

  // Bounded polling with backoff for 'already_processing'.
  async function pollUntilSettled(
    poll: () => Promise<{ outcome: string; [k: string]: unknown }>,
    { maxAttempts = 8, baseDelayMs = 2000, maxDelayMs = 10000 } = {},
  ) {
    let attempt = 0
    while (attempt < maxAttempts) {
      const result = await poll()
      if (result.outcome !== 'already_processing') {
        if (!reuseWhileNonTerminal(result.outcome)) clearOnTerminalOutcome()
        return result
      }
      const delay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs)
      await new Promise((r) => setTimeout(r, delay))
      attempt += 1
    }
    return { outcome: 'timed_out' }
  }

  return { getOrCreateKey, clearOnTerminalOutcome, pollUntilSettled }
}
```

On the calling component: `getOrCreateKey()` is called once when the user clicks "Scan for keywords"; the returned key is sent with the request; on any terminal response (`completed`, `replay_result`, `result_expired`, `released`, `no_credits`, `invalid_result`), `clearOnTerminalOutcome()` runs so the next click generates a genuinely new key; on `already_processing`, the component enters a "still working" state and uses `pollUntilSettled` rather than resubmitting.

---

## 6. Maintenance cutover implementation

```sql
create table if not exists public.feature_flags (
  key text primary key,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
revoke all on public.feature_flags from public, anon, authenticated;
grant select on public.feature_flags to service_role;

insert into public.feature_flags (key, enabled) values ('keyword_scan_maintenance', false)
on conflict (key) do nothing;
```

**Item 29 correction accepted and implemented:** the *old* `keyword-scan` edge function does not call any new RPC, so a flag inside `reserve_keyword_scan` cannot stop it. The maintenance implementation instead **temporarily redeploys the `keyword-scan` slug itself** to a minimal handler that checks the flag first and returns 503 before doing anything else — shown below, meant to be deployed as step 3 of the cutover sequence (Section 9) and then replaced by the real new implementation (Section 4.1) at step 8:

```ts
// TEMPORARY maintenance deployment of supabase/functions/keyword-scan/index.ts
// Deployed at cutover step 3, replaced by the real new version at step 8.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  return new Response(
    JSON.stringify({ error: 'unavailable', message: 'Keyword Scan is temporarily unavailable for a scheduled upgrade. Please try again shortly.' }),
    { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
```

**Item 30:** during the *initial legacy cutover*, this maintenance version blocks everything — there is no new-system cache to replay yet, so a complete block is correct and sufficient. For *later* emergency maintenance (post-launch), the maintenance version instead checks the `feature_flags` row from inside the real (already-deployed) `reserve_keyword_scan`/edge function path — blocking only new reservations while still permitting `replay_result`/status reads through the database, since at that point genuine cached results exist and a full block would needlessly break replay for users mid-scan. Both modes are documented as distinct, not conflated.

---

## 7. Complete test matrix

**Original 10 + 12 (from prior rounds), still pending execution against this corrected design, plus the new items below:**

| # | Scenario | Expected |
|---|---|---|
| 23 | Two identical `reserve_keyword_scan` calls, same key, both while `reserved` | Second returns `already_processing`, no second credit reserved |
| 24 | `reserve_keyword_scan` on a `released` key | Returns `released` (terminal), no reuse, no new reservation |
| 25 | `complete_keyword_scan` with a non-string array element | Rejected, `invalid_result`, credit atomically released, no second network call |
| 26 | `complete_keyword_scan` with a duplicate term | Rejected, `invalid_result` |
| 27 | `complete_keyword_scan` with `match_percent` inconsistent with totals | Rejected, `invalid_result` |
| 28 | Reservation abandoned (simulated: `last_attempted_at` backdated 20 minutes), reconciler runs | Transitions to `released`, credit restored (or `batch_expired_not_restored` if applicable), idempotent on rerun |
| 29 | Late `complete_keyword_scan` call against a reconciled (`released`) reservation | Raises `reservation_already_released`, no double-restore, no completion |
| 30 | Two concurrent `grant_pack_credits` calls, same `stripe_payment_intent_id`, identical parameters | Exactly one insert; second returns `already_granted=true` with stored values |
| 31 | Two concurrent `grant_pack_credits` calls, same `stripe_payment_intent_id`, different `pack_id` | Second raises `fulfilment_conflict` |
| 32 | Stripe webhook redelivery while original handling still genuinely in-flight | Second delivery acked without reprocessing (`already_processing` response) |
| 33 | Stripe webhook redelivery after original handling failed | Retried, eligible to succeed |
| 34 | Stripe webhook redelivery after original handling succeeded | Acked as duplicate, no reprocessing |
| 35 | `reserve_refund` while a Keyword Scan reservation is `reserved` against the same batch | `active_reservation_exists`, no refund reservation created |
| 36 | Concurrent `reserve_keyword_scan` and `reserve_refund` on the same batch | One succeeds, one observes the other's committed state (via the shared profile-first lock) — never both |
| 37 | `request-refund` Stripe call succeeds, `finalize_refund` DB call fails | Response indicates `reconciling: true`; later `charge.refunded` webhook completes it idempotently |
| 38 | Repeated `charge.refunded` webhook for an already-finalized refund | No-op, `already_finalized` |
| 39 | `expire_credit_batches` and `reserve_keyword_scan` running concurrently for the same user | No deadlock (matching profile-first lock order verified) |
| 40 | Job description upload (new input mode) | Text extracted via `extract-job-file`, scan proceeds normally |
| 41 | Oversized base64 payload | Rejected with 413 before any decoding/parsing |
| 42 | Bounded polling on `already_processing` | Stops after the configured max attempts/backoff ceiling, never unlimited rapid polling |
| 43 | Replay request does not consume the new-scan rate-limit bucket | Confirmed via separate bucket counters |

---

## 8. Production preconditions

```sql
-- Usage audit (unchanged from the prior round -- rerun immediately before deployment)
select
  count(*) filter (where keyword_scans_consumed > 0) as users_with_keyword_scans_consumed_gt_0,
  coalesce(sum(keyword_scans_consumed), 0) as total_legacy_keyword_scans_consumed,
  count(*) as total_profiles,
  count(*) filter (where keyword_scans_consumed < 3) as users_eligible_for_free_scans,
  (select count(*) from credit_batches where source='purchase') as existing_paid_purchases
from profiles;

select event_type, count(*) from analytics_events where event_type like '%keyword%' group by 1;

-- Role-graph sanity check (from the Part B report, re-run here too since
-- Part A's reconcile function and refund RPCs are also service-only /
-- authenticated-boundary-sensitive)
select rolname,
  'postgres' = any(array(
    select b.rolname from pg_auth_members m
    join pg_roles b on b.oid = m.roleid
    where m.member = r.oid
  )) as can_become_postgres
from pg_roles r
where rolname in ('anon','authenticated','service_role','authenticator');
-- Must stop if any of the four rows return true.

-- New: confirm no in-flight legacy Keyword Scan usage right before cutover
select count(*) from analytics_events
where event_type = 'keyword_scan_completed' and created_at > now() - interval '1 hour';
```

---

## 9. Deployment sequence (Item 29's 12 steps, fully adopted)

1. Complete production precondition audit (Section 8).
2. Deploy and verify Part B (trigger repair) separately — its own approval, its own commit.
3. Deploy the temporary maintenance version of `keyword-scan` (Section 6) — returns 503 before any parsing or charging.
4. Wait longer than the maximum legitimate old-edge-function execution duration (the old function's own `OPENAI_TIMEOUT_MS` is 20s plus network overhead — waiting a full 2 minutes provides wide margin) so every old in-flight invocation has finished or failed.
5. Record the final frozen value of `profiles.keyword_scans_consumed` totals (the same audit query from Section 8) as the documented cutover baseline.
6. Apply the Part A database migration (Section 1) — additive + replaced function bodies; the maintenance-mode `keyword-scan` is unaffected either way.
7. Deploy the verified Stripe webhook changes (Section 4.2) — separate approval/commit from the migration.
8. Deploy the real new `keyword-scan` edge function (Section 4.1).
9. Run authenticated canary tests using a designated test account against production.
10. Deploy the frontend (new input modes, `get_credit_summary`-based displays, idempotency hook).
11. Re-enable Keyword Scan access (flip `feature_flags.keyword_scan_maintenance` to `false`, or redeploy without the maintenance short-circuit — whichever mechanism is chosen, confirmed by step 12).
12. Verify balances, reservations, ledger entries, expiry, refunds, logs, and analytics for the canary account and for aggregate production metrics.

Each of the five deployable units (Part B, Part A migration, Stripe webhook, Keyword Scan function, frontend) remains its own separate approval and its own separate commit — none bundled.

---

## 10. Roll-forward recovery plan

Unchanged in structure from the prior round, extended for the new objects:

- **Phase 1 (application):** the same `feature_flags.keyword_scan_maintenance` switch used for cutover doubles as the emergency rollback switch — server-controlled, not client-only. Per Item 30, post-launch maintenance mode permits replay/status reads through the database even while blocking new reservations.
- **Phase 2 (function):** restore a prior verified RPC/edge-function version only if it understands the current schema and cannot grant unlimited access or double-spend. The pre-metered old `keyword-scan` function remains explicitly disqualified as a rollback target for the reasons already established.
- **Phase 3 (data):** `keyword_scan_reservations`, `refund_events`, `stripe_webhook_events`'s new columns, and every `credit_batches`/`check_ledger` row are retained permanently. Data-bearing schema removal deferred to a later, separate cleanup migration after the retention period and after proving the data is no longer needed.

---

## 11. Explicit resolution list — all 24 + 31 items

| # | Item | Resolved in |
|---|---|---|
| Correction Log 1 | Direct table access | Section 1c (`revoke all`, no SELECT policy) |
| Correction Log 2 | `credit_source` at reservation | Section 3.1 (already was; documentation corrected) |
| Correction Log 3–14 | Constraints, structural validation, expiry consistency, replay expiry, PII honesty, atomic invalid-result, ledger completeness, structured release outcomes, summary naming/expiry, profile-not-found, grants, SECURITY DEFINER hardening | Sections 1c, 3.1–3.8 |
| Additional 1 | Webhook dedup unsafe | Section 1d, 4.2 |
| Additional 2 | Atomic fulfilment | Section 3.6 |
| Additional 3 | Verify purchase from Stripe data | Section 4.2 (`handlePackCheckoutCompleted`) |
| Additional 4 | Database-derived expiry | Section 3.6 (`p_paid_at + interval '90 days'`) |
| Additional 5 | Refund race | Sections 3.9, 3.10, 4.3 |
| Additional 6 | Refund DB updates atomic | Sections 3.9, 3.10 |
| Additional 7 | Refund copy | Flagged as outstanding content work — see Section 12 note below |
| Additional 8 | Remove stale reuse | Section 3.1 |
| Additional 9 | State model | Section 1c table comment + constraints |
| Additional 10 | Abandoned reconciliation | Section 3.4 |
| Additional 11 | Direct table access (repeat) | Section 1c |
| Additional 12 | Constraints | Section 1c |
| Additional 13 | Completion replay expiry | Sections 3.1, 3.2 |
| Additional 14 | Atomic invalid-result | Section 3.2 |
| Additional 15 | External failure handling | Section 4.1 (`isMaintenanceModeActive`, release error logging) |
| Additional 16 | Release outcomes | Section 3.3 |
| Additional 17 | Ledger model | Section 1b, 3.2–3.7 |
| Additional 18 | Lock order | Sections 3.1, 3.7 |
| Additional 19 | Expiry accuracy | Sections 3.1, 3.5 |
| Additional 20 | Credit summary fields | Section 3.5 |
| Additional 21 | Legacy free usage | Sections 3.1, 3.5 |
| Additional 22 | Structural validation | Section 1c |
| Additional 23 | JD upload | Section 4.1 |
| Additional 24 | Request size limits | Section 4.1 |
| Additional 25 | `extract-job-url` SSRF audit | **Explicitly out of scope, flagged as a required separate follow-up** |
| Additional 26 | Result schema | Sections 3.2, 4.1 |
| Additional 27 | Privacy claim honesty | Section 3.2 note |
| Additional 28 | Rate limit vs. replay | Section 4.1 (separate buckets) |
| Additional 29 | Cutover doesn't stop old function | Sections 6, 9 |
| Additional 30 | Maintenance vs. replay | Section 6 |
| Additional 31 | Separate approvals | Section 9 (five distinct steps/commits) |

**Item "Additional 7" (refund copy) status:** not resolved in this document — it is a content/copy deliverable (Pricing page, Billing page, refund explanation), not a code change, and is queued as its own task using the exact wording you specified: *"A pack is eligible for the 7 day refund only if none of its Recruiter Checks or Keyword Scans have been used."* I have not drafted or placed this copy anywhere yet, and will not without a separate go-ahead, since it touches user-facing marketing/legal-adjacent pages outside this migration's scope.

---

**Nothing in this package has been applied, deployed, committed, or pushed.** This document is the complete corrected proposal for your review.
