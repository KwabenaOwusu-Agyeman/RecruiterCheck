# Part A — Keyword Scan Ledger Redesign: Complete Review Package

**Status: nothing in this document has been applied to any database or deployed anywhere.** This file consolidates Messages 1–5 of the Part A review (previously sent in chat, some truncated on delivery) into one document, plus the running log of every correction you requested during review. It supersedes nothing — it is a record for your review. The actual corrected migration will be produced only after you approve this package.

`myrecruitercheck-scoring-test` remains non-pristine and synthetic-only, carrying fixture data from Part B testing (synthetic users A/B, test `credit_batches`/`check_ledger`/`keyword_scan_reservations` rows) and the *prior, superseded* draft of this migration (including the removed `profiles.keyword_scan_balance` column and the profile-writing RPC versions). None of it is production data. Nothing has been applied to production. Part B's approved test-project state is separate and unaffected.

---

## Message 1 — Sections 1–5: Schema, columns, table, constraints, indexes, RLS

### Section 1 — `credit_batches` schema changes

```sql
alter table public.credit_batches
  add column if not exists keyword_scans_granted integer not null default 0
    check (keyword_scans_granted >= 0),
  add column if not exists keyword_scans_remaining integer not null default 0
    check (keyword_scans_remaining >= 0);

do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='credit_batches' and column_name='keyword_scans_remaining') then
    raise exception 'credit_batches.keyword_scans_remaining missing after migration';
  end if;
end $$;
```

### Section 2 — `check_ledger` schema changes

```sql
alter table public.check_ledger add column if not exists credit_type text;
update public.check_ledger set credit_type = 'check' where credit_type is null;
alter table public.check_ledger alter column credit_type set not null;
alter table public.check_ledger alter column credit_type set default 'check';

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
```

### Section 3 — `keyword_scan_reservations` table (as originally drafted — see Correction Log for required changes)

```sql
create table if not exists public.keyword_scan_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 8 and 100),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  credit_source text check (credit_source in ('free', 'paid')),
  batch_id uuid references public.credit_batches (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  unique (user_id, idempotency_key)
);

do $$
begin
  if not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='keyword_scan_reservations' and column_name='result_expires_at')
    or not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='keyword_scan_reservations' and column_name='credit_source')
  then
    raise exception 'keyword_scan_reservations exists with an unexpected structure -- refusing to proceed';
  end if;
end $$;
```

**Columns, exact types (as originally drafted):**

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | `uuid` | no | `gen_random_uuid()` |
| `user_id` | `uuid` | no | — |
| `idempotency_key` | `text` | no | — |
| `status` | `text` | no | `'reserved'` |
| `credit_source` | `text` | **yes (to be corrected to NOT NULL — see log)** | — |
| `batch_id` | `uuid` | yes | — |
| `created_at` | `timestamptz` | no | `now()` |
| `completed_at` | `timestamptz` | yes | — |
| `result` | `jsonb` | yes | — |
| `result_expires_at` | `timestamptz` | yes | — |

### Section 4 — Indexes

```sql
create index if not exists credit_batches_user_expiry_ks_idx
  on public.credit_batches (user_id, expires_at nulls last)
  where keyword_scans_remaining > 0;

create index if not exists keyword_scan_reservations_cleanup_idx
  on public.keyword_scan_reservations (result_expires_at) where result is not null;
```

### Section 5 — RLS policy (as originally drafted — REJECTED, see Correction Log item 1)

```sql
alter table public.keyword_scan_reservations enable row level security;

drop policy if exists "Users can view own keyword scan reservations" on public.keyword_scan_reservations;
create policy "Users can view own keyword scan reservations"
  on public.keyword_scan_reservations for select using (auth.uid() = user_id);
```

```sql
comment on column public.profiles.keyword_scans_consumed is
  'Frozen, read-only legacy offset: free Keyword Scan usage recorded before the reservation-based system (keyword_scan_reservations) took over. No code writes this column after cutover.';
```

**Empirical finding on Supabase default privileges (verified on the test project, real query result):**
```
anon:          SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
authenticated: SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
service_role:  SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
postgres:      SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
```
Confirms: Supabase's `ALTER DEFAULT PRIVILEGES` bootstrap grants broad direct table access to every role immediately on table creation. RLS with no `INSERT`/`UPDATE`/`DELETE` policy already default-denies those, but the `SELECT` policy above, combined with this grant, lets an authenticated user read `result`/`result_expires_at` directly via PostgREST's auto-generated REST endpoint — bypassing the RPC's expiry gate. This is the basis for Correction Log item 1.

---

## Message 2 — Sections 6–10: first group of RPC bodies + grants

### Section 6 — `reserve_keyword_scan` (as originally drafted — REJECTED, see Correction Log item 2)

```sql
create or replace function public.reserve_keyword_scan(p_idempotency_key text)
returns table(outcome text, reservation_id uuid, cached_result jsonb)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
  v_stale_after constant interval := interval '2 minutes';
  v_free_limit constant integer := 3;
  v_legacy_offset integer;
  v_new_free_used integer;
  v_batch_id uuid;
  v_credit_source text;
  v_reusing_row boolean := false;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform 1 from public.profiles where id = v_user_id for update;

  select * into v_row
    from public.keyword_scan_reservations
    where user_id = v_user_id and idempotency_key = p_idempotency_key
    for update;

  if found then
    if v_row.status = 'completed' then
      if v_row.result is not null and v_row.result_expires_at is not null and v_row.result_expires_at > now() then
        return query select 'replay_result'::text, v_row.id, v_row.result;
      else
        return query select 'result_expired'::text, v_row.id, null::jsonb;
      end if;
      return;
    end if;

    if v_row.status = 'reserved' and v_row.created_at >= now() - v_stale_after then
      return query select 'already_processing'::text, v_row.id, null::jsonb;
      return;
    end if;

    v_reusing_row := true;

    if v_row.status = 'reserved' and v_row.credit_source = 'paid' and v_row.batch_id is not null then
      update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
        where id = v_row.batch_id and expires_at > now();
    end if;
  end if;

  select id into v_batch_id
    from public.credit_batches
    where user_id = v_user_id
      and keyword_scans_remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at nulls last
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

    if greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0) > 0 then
      v_credit_source := 'free';
    else
      return query select 'no_credits'::text, null::uuid, null::jsonb;
      return;
    end if;
  end if;

  if v_reusing_row then
    update public.keyword_scan_reservations
      set status = 'reserved', credit_source = v_credit_source, batch_id = v_batch_id,
          created_at = now(), completed_at = null, result = null, result_expires_at = null
      where id = v_row.id;
    return query select 'reserved'::text, v_row.id, null::jsonb;
  else
    insert into public.keyword_scan_reservations (user_id, idempotency_key, status, credit_source, batch_id)
    values (v_user_id, p_idempotency_key, 'reserved', v_credit_source, v_batch_id)
    returning id into v_row.id;
    return query select 'reserved'::text, v_row.id, null::jsonb;
  end if;
end;
$function$;
```

**Note recorded during review:** `credit_source`/`batch_id` were confirmed to already be populated before either the `insert` or the reuse-path `update` returns `'reserved'` — the design intent behind "assign credit source at reservation" was already correct in the code; only the surrounding prose describing it was imprecise. The `v_stale_after`/`v_reusing_row`/automatic-reuse mechanism itself is rejected outright — see Correction Log item 2 — independent of that note.

### Section 7 — `complete_keyword_scan` (as originally drafted — REJECTED, see Correction Log items 5, 6, 7)

```sql
create or replace function public.complete_keyword_scan(p_reservation_id uuid, p_result jsonb)
returns table(outcome text, cached_result jsonb, result_expires_at timestamptz)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_user_id uuid;
  v_row public.keyword_scan_reservations%rowtype;
  v_validated jsonb;
  v_result_ttl constant interval := interval '24 hours';
  v_match_percent int;
  v_matched_total int;
  v_missing_total int;
  v_matched jsonb;
  v_missing jsonb;
  v_term text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then raise exception 'reservation_not_found'; end if;

  if v_row.status = 'completed' then
    return query select 'already_completed'::text, v_row.result, v_row.result_expires_at;
    return;
  end if;

  if v_row.status <> 'reserved' then
    raise exception 'reservation_not_reserved';
  end if;

  if v_row.credit_source is null then
    raise exception 'reservation_missing_credit_source: reservation_id=%, user_id=%', v_row.id, v_user_id;
  end if;

  if p_result is null or jsonb_typeof(p_result) <> 'object' then raise exception 'invalid_result_payload'; end if;
  if exists (select key from jsonb_object_keys(p_result) as key
      where key not in ('match_percent','matched_total','missing_total','matched_terms','missing_terms'))
  then raise exception 'invalid_result_payload'; end if;
  if not (p_result ?& array['match_percent','matched_total','missing_total','matched_terms','missing_terms'])
  then raise exception 'invalid_result_payload'; end if;

  v_match_percent := (p_result->>'match_percent')::int;
  v_matched_total := (p_result->>'matched_total')::int;
  v_missing_total := (p_result->>'missing_total')::int;
  v_matched := p_result->'matched_terms';
  v_missing := p_result->'missing_terms';

  if v_match_percent is null or v_match_percent < 0 or v_match_percent > 100 then raise exception 'invalid_result_payload'; end if;
  if v_matched_total is null or v_matched_total < 0 or v_missing_total is null or v_missing_total < 0 then raise exception 'invalid_result_payload'; end if;
  if jsonb_typeof(v_matched) <> 'array' or jsonb_typeof(v_missing) <> 'array' then raise exception 'invalid_result_payload'; end if;
  if jsonb_array_length(v_matched) > 3 or jsonb_array_length(v_missing) > 3 then raise exception 'invalid_result_payload'; end if;

  for v_term in
    select jsonb_array_elements_text(v_matched)
    union all
    select jsonb_array_elements_text(v_missing)
  loop
    if v_term is null or length(trim(v_term)) = 0 or length(v_term) > 80 then
      raise exception 'invalid_result_payload';
    end if;
    if v_term ~* '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}' then
      raise exception 'invalid_result_payload';
    end if;
    if regexp_replace(v_term, '\D', '', 'g') ~ '^[0-9]{7,}$' then
      raise exception 'invalid_result_payload';
    end if;
  end loop;

  v_validated := jsonb_build_object(
    'match_percent', v_match_percent,
    'matched_total', v_matched_total,
    'missing_total', v_missing_total,
    'matched_terms', v_matched,
    'missing_terms', v_missing
  );

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, note)
  values (
    v_user_id, v_row.batch_id, 'used', -1, 'keyword_scan',
    'reservation ' || v_row.id || ' (' || v_row.credit_source || ')'
  );

  update public.keyword_scan_reservations
    set status = 'completed', completed_at = now(), result = v_validated, result_expires_at = now() + v_result_ttl
    where id = v_row.id;

  return query select 'completed'::text, v_validated, (now() + v_result_ttl);
end;
$function$;
```

**Confirmed defects, not yet fixed here:**
- `jsonb_array_elements_text()` silently coerces non-string array members (number/object/array/boolean/null) to text instead of rejecting them (Correction Log item 6).
- Returns `v_row.result` on replay of a `'completed'` row without checking `result_expires_at` (Correction Log item 5) — this specific function path was never actually exercised this way in testing since `reserve_keyword_scan` intercepts replay before reaching here, but `complete_keyword_scan`'s own "already_completed" branch has the same unchecked-expiry defect independently and must be fixed the same way.
- An invalid `p_result` raises an exception, leaving the reservation stuck in `'reserved'`, stranding the credit unless a second, separate `release` call succeeds (Correction Log item 7).

### Section 8 — `release_keyword_scan_reservation` (as originally drafted — REJECTED, see Correction Log item 9)

```sql
create or replace function public.release_keyword_scan_reservation(p_reservation_id uuid)
returns void
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

  select * into v_row
    from public.keyword_scan_reservations
    where id = p_reservation_id and user_id = v_user_id
    for update;

  if not found then raise exception 'reservation_not_found'; end if;

  if v_row.status <> 'reserved' then
    return;
  end if;

  if v_row.credit_source = 'paid' and v_row.batch_id is not null then
    update public.credit_batches set keyword_scans_remaining = keyword_scans_remaining + 1
      where id = v_row.batch_id and expires_at > now();
  end if;

  update public.keyword_scan_reservations set status = 'released' where id = p_reservation_id;
end;
$function$;
```

**Confirmed defects:** returns `void` — no distinguishable outcome (`released`/`already_released`/`already_completed`/`batch_expired_not_restored`/`reservation_not_found`), and does not write a `'released'` ledger entry despite the schema supporting it (Correction Log items 8, 9).

### Section 9 — `get_credit_summary` (as originally drafted — REJECTED, see Correction Log items 10, 11)

```sql
create or replace function public.get_credit_summary()
returns table(
  valid_check_credits integer,
  valid_keyword_scan_credits integer,
  free_checks_remaining integer,
  free_keyword_scans_remaining integer,
  next_expiry timestamptz,
  next_expiry_check_count integer,
  next_expiry_keyword_scan_count integer
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
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'not_authenticated'; end if;

  select greatest(least(keyword_scans_consumed, v_free_limit), 0) into v_legacy_offset
    from public.profiles where id = v_user_id;

  select count(*) into v_new_free_used
    from public.keyword_scan_reservations
    where user_id = v_user_id and credit_source = 'free' and status in ('reserved', 'completed');

  return query
  with valid_batches as (
    select b.expires_at, b.checks_remaining, b.keyword_scans_remaining
    from public.credit_batches b
    where b.user_id = v_user_id
      and (b.expires_at is null or b.expires_at > now())
      and (b.checks_remaining > 0 or b.keyword_scans_remaining > 0)
  ),
  next_batch as (
    select expires_at, checks_remaining, keyword_scans_remaining
    from valid_batches
    where expires_at is not null
    order by expires_at asc
    limit 1
  )
  select
    coalesce((select sum(checks_remaining) from valid_batches), 0)::int + greatest(1 - p.lifetime_checks_consumed, 0),
    coalesce((select sum(keyword_scans_remaining) from valid_batches), 0)::int
      + greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0),
    greatest(1 - p.lifetime_checks_consumed, 0),
    greatest(v_free_limit - v_legacy_offset - v_new_free_used, 0),
    (select expires_at from next_batch),
    (select checks_remaining from next_batch),
    (select keyword_scans_remaining from next_batch)
  from public.profiles p
  where p.id = v_user_id;
end;
$function$;
```

**Confirmed defects:** returns no row (silently) if the profile doesn't exist, instead of a controlled error; `valid_*_credits` names are ambiguous (include free credits without saying so); a single `next_expiry` can misrepresent one credit type when the two types' nearest-expiring batches differ.

### Section 10 — Grants for these four functions

```sql
revoke execute on function public.reserve_keyword_scan(text) from public, anon;
grant execute on function public.reserve_keyword_scan(text) to authenticated;

revoke execute on function public.complete_keyword_scan(uuid, jsonb) from public, anon;
grant execute on function public.complete_keyword_scan(uuid, jsonb) to authenticated;

revoke execute on function public.release_keyword_scan_reservation(uuid) from public, anon;
grant execute on function public.release_keyword_scan_reservation(uuid) to authenticated;

revoke execute on function public.get_credit_summary() from public, anon;
grant execute on function public.get_credit_summary() to authenticated;
```

**Outstanding per Correction Log item 12:** each of these four `revoke` statements omits `authenticated` (correct, since these functions are meant to be `authenticated`-callable) — but per the confirmed Supabase default-privilege behavior above, each function must still be explicitly audited for a default `anon` EXECUTE grant, the same way `cleanup_expired_keyword_scan_results` was found to have one. Not yet re-verified per function.

---

## Message 3 — Sections 11–14: remaining function bodies, expiry handling, cleanup

### Section 11 — `grant_pack_credits` (as originally drafted — REJECTED, see Correction Log items 3, 4)

```sql
create or replace function public.grant_pack_credits(
  p_user_id uuid,
  p_pack_id text,
  p_stripe_payment_intent_id text,
  p_stripe_checkout_session_id text,
  p_expires_at timestamptz
)
returns table(already_granted boolean, batch_id uuid, checks_granted integer, keyword_scans_granted integer)
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_checks_amount integer;
  v_keyword_scans_amount integer;
  v_existing_batch_id uuid;
  v_new_batch_id uuid;
begin
  if p_stripe_payment_intent_id is null or length(p_stripe_payment_intent_id) = 0 then
    raise exception 'missing_fulfilment_identifier';
  end if;

  case p_pack_id
    when 'small' then v_checks_amount := 5; v_keyword_scans_amount := 5;
    when 'medium' then v_checks_amount := 15; v_keyword_scans_amount := 15;
    when 'large' then v_checks_amount := 40; v_keyword_scans_amount := 40;
    else raise exception 'unknown_pack_id: %', p_pack_id;
  end case;

  perform 1 from public.profiles where id = p_user_id for update;

  select id into v_existing_batch_id from public.credit_batches
    where stripe_payment_intent_id = p_stripe_payment_intent_id;

  if v_existing_batch_id is not null then
    return query select true, v_existing_batch_id, v_checks_amount, v_keyword_scans_amount;
    return;
  end if;

  insert into public.credit_batches
    (user_id, source, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining,
     stripe_payment_intent_id, stripe_checkout_session_id, pack_id, expires_at)
  values
    (p_user_id, 'purchase', v_checks_amount, v_checks_amount, v_keyword_scans_amount, v_keyword_scans_amount,
     p_stripe_payment_intent_id, p_stripe_checkout_session_id, p_pack_id, p_expires_at)
  returning id into v_new_batch_id;

  insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type, related_stripe_payment_intent_id)
  values
    (p_user_id, v_new_batch_id, 'purchased', v_checks_amount, 'check', p_stripe_payment_intent_id),
    (p_user_id, v_new_batch_id, 'purchased', v_keyword_scans_amount, 'keyword_scan', p_stripe_payment_intent_id);

  update public.profiles
    set checks_balance = checks_balance + v_checks_amount
    where id = p_user_id;

  return query select false, v_new_batch_id, v_checks_amount, v_keyword_scans_amount;
end;
$function$;

revoke execute on function public.grant_pack_credits(uuid, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.grant_pack_credits(uuid, text, text, text, timestamptz) to service_role;
```

**Confirmed defects:** `select ... ; if found then return ; else insert` is a race — two concurrent webhook deliveries for the same `stripe_payment_intent_id` (against different or the same user) can both pass the existence check before either inserts, resulting in a possible duplicate grant or a `unique` constraint error surfaced as a raw 500 rather than a controlled response. `p_expires_at` is accepted with no non-null/validity enforcement.

### Section 12 — `expire_credit_batches` (as originally drafted — REJECTED, see Correction Log items 4, 6, 7)

```sql
create or replace function public.expire_credit_batches()
returns void
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_batch record;
begin
  for v_batch in
    select id, user_id, checks_remaining, keyword_scans_remaining
    from public.credit_batches
    where expires_at is not null and expires_at < now()
      and (checks_remaining > 0 or keyword_scans_remaining > 0)
    for update skip locked
  loop
    perform 1 from public.profiles where id = v_batch.user_id for update;

    update public.credit_batches
      set checks_remaining = 0, keyword_scans_remaining = 0
      where id = v_batch.id;

    update public.profiles
      set checks_balance = greatest(checks_balance - v_batch.checks_remaining, 0)
      where id = v_batch.user_id;

    if v_batch.checks_remaining > 0 then
      insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
      values (v_batch.user_id, v_batch.id, 'expired', -v_batch.checks_remaining, 'check');
    end if;
    if v_batch.keyword_scans_remaining > 0 then
      insert into public.check_ledger (user_id, batch_id, entry_type, amount, credit_type)
      values (v_batch.user_id, v_batch.id, 'expired', -v_batch.keyword_scans_remaining, 'keyword_scan');
    end if;
  end loop;
end;
$function$;

select cron.schedule('expire-credit-batches', '0 3 * * *', $$select public.expire_credit_batches()$$);
```

**Confirmed defects:** locks `credit_batches` first, `profiles` second — inverted relative to `reserve_keyword_scan`'s `profiles`-first order, a deadlock risk under concurrent execution. No unique constraint prevents a theoretical duplicate `'expired'` ledger row if this function were ever invoked concurrently by two workers on the same batch (currently mitigated only by `for update skip locked`, which the correction log requires proving is sufficient, not assuming). `where expires_at is not null` silently exempts a null-expiry batch from ever being swept.

### Section 13 — `cleanup_expired_keyword_scan_results` (as originally drafted)

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

revoke execute on function public.cleanup_expired_keyword_scan_results() from public, anon, authenticated;

select cron.schedule('cleanup-expired-keyword-scan-results', '0 * * * *', $$select public.cleanup_expired_keyword_scan_results()$$);
```

Accepted in principle: clears only `result`, retains all accounting fields, runs hourly. Final design must still add the direct-table-access lockdown (Correction Log item 1) as the second, independent layer alongside this.

### Section 14 — Cached-result validation

Same block shown inside Section 7 (`complete_keyword_scan`) above — not duplicated a third time. Confirmed defect: non-string array elements are silently coerced rather than rejected (Correction Log item 6).

---

## Message 4A — Section 15: complete Edge Function drafts

*(Full text as sent in chat; reproduced here complete, not summarized.)*

### `supabase/functions/keyword-scan/index.ts` (complete draft)

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { Buffer } from 'node:buffer'
import mammoth from 'npm:mammoth@1.8.0'
import { extractText as extractPdfText, getDocumentProxy } from 'npm:unpdf@0.12.1'

// Reservation-based Keyword Scan. Reuses extract-job-file / extract-job-url
// for the new upload/URL job-description input modes rather than
// duplicating their parsing logic. CV parsing stays local (base64 bytes
// held only in memory for this single request, never persisted) since a
// Keyword Scan never uploads or stores the CV anywhere.

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_CV_CHARS = 15000
const MAX_JOB_DESCRIPTION_CHARS = 15000
const PARSE_TIMEOUT_MS = 15000
const OPENAI_TIMEOUT_MS = 20000
const MIN_JOB_DESCRIPTION_CHARS = 50

const RATE_LIMIT_BUCKET = 'keyword-scan'
const RATE_LIMIT_MAX = 10
const RATE_LIMIT_WINDOW_SECONDS = 3600

interface ScanRequest {
  idempotencyKey: string
  cvBase64?: string
  cvFileName?: string
  cvMimeType?: string
  cvPastedText?: string
  jobDescription?: string
  jobDescriptionUrl?: string
}

interface ScanResult {
  match_percent: number
  matched_total: number
  missing_total: number
  matched_terms: string[]
  missing_terms: string[]
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

    if (!openaiApiKey) {
      return jsonResponse({ error: 'Scan service is not configured' }, 503)
    }

    // userClient: the caller's own JWT. Every credit-affecting RPC call
    // below goes through THIS client, never the admin/service-role client,
    // so auth.uid() inside the RPCs resolves to the real caller.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const body = (await req.json()) as ScanRequest

    if (!body.idempotencyKey || body.idempotencyKey.length < 8 || body.idempotencyKey.length > 100) {
      return jsonResponse({ error: 'Missing or invalid idempotency key' }, 400)
    }

    const hasCv = Boolean(body.cvBase64) || Boolean(body.cvPastedText?.trim())
    const hasJob =
      Boolean(body.jobDescription?.trim()) || Boolean(body.jobDescriptionUrl?.trim())

    if (!hasCv || !hasJob) {
      return jsonResponse({ error: 'A CV and a job description are both required' }, 400)
    }

    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )
    if (rateLimitError) {
      console.error('keyword-scan: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many scan requests. Please try again later.' }, 429)
    }

    // ---- Extract CV text (upload or paste) --------------------------------
    let cvText: string
    try {
      if (body.cvBase64 && body.cvFileName) {
        cvText = await extractCvText(
          Buffer.from(body.cvBase64, 'base64'),
          body.cvFileName,
          body.cvMimeType,
        )
      } else {
        cvText = (body.cvPastedText ?? '').trim()
        if (cvText.length < 50) {
          return jsonResponse({ error: 'Pasted CV text is too short' }, 400)
        }
        cvText = cvText.slice(0, MAX_CV_CHARS)
      }
    } catch (error) {
      console.error('keyword-scan: CV parsing failed', {
        fileName: body.cvFileName,
        message: error instanceof Error ? error.message : String(error),
      })
      return jsonResponse({ error: 'Could not read text from this CV file' }, 400)
    }

    // ---- Extract job description (paste, upload, or URL) ------------------
    let jobDescriptionText: string
    try {
      if (body.jobDescriptionUrl) {
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

    // ---- Reserve a credit: authenticated JWT, auth.uid()-bound -------------
    const { data: reserveRows, error: reserveError } = await userClient.rpc(
      'reserve_keyword_scan',
      { p_idempotency_key: body.idempotencyKey },
    )
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
          {
            error: 'expired',
            message:
              'Your previous scan completed, but its temporary result has expired. Start a new Keyword Scan to see the result again.',
          },
          410,
        )
      case 'already_processing':
        return jsonResponse(
          { error: 'A scan with this request is already in progress. Please wait.' },
          409,
        )
      case 'no_credits':
        return jsonResponse({ error: 'You have used all your Keyword Scans.' }, 429)
      case 'reserved':
        break
      default:
        console.error('keyword-scan: unexpected reserve outcome', reservation)
        return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }

    // ---- Run the actual scan ------------------------------------------------
    let result: ScanResult
    try {
      result = await callOpenAI(openaiApiKey, cvText, jobDescriptionText)
    } catch (error) {
      console.error('keyword-scan: OpenAI call failed', error)
      await userClient.rpc('release_keyword_scan_reservation', {
        p_reservation_id: reservation.reservation_id,
      })
      return jsonResponse({ error: 'Could not complete the scan. Please try again.' }, 502)
    }

    // ---- Complete: validate + post accounting + cache result ---------------
    const { data: completeRows, error: completeError } = await userClient.rpc(
      'complete_keyword_scan',
      { p_reservation_id: reservation.reservation_id, p_result: result },
    )
    if (completeError) {
      console.error('keyword-scan: complete_keyword_scan failed', completeError)
      // FLAGGED: this second-call release is the pattern explicitly
      // rejected during review. Superseded by the atomic invalid_result
      // design once specified -- shown as-is, pre-correction.
      await userClient.rpc('release_keyword_scan_reservation', {
        p_reservation_id: reservation.reservation_id,
      })
      return jsonResponse({ error: 'Could not save the scan result. Please try again.' }, 500)
    }

    return jsonResponse(completeRows[0].cached_result)
  } catch (error) {
    console.error('keyword-scan error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs),
    ),
  ])
}

async function extractCvText(bytes: Buffer, fileName: string, mimeType?: string): Promise<string> {
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
  if (cleaned.length < 50) {
    throw new Error('Extracted text is too short')
  }
  return cleaned.slice(0, MAX_CV_CHARS)
}

async function callOpenAI(apiKey: string, cvText: string, jobDescription: string): Promise<ScanResult> {
  const systemPrompt = `You compare a CV against a job description for keyword and skill overlap only. Do not judge seniority, quality, or overall fit -- that is a separate, paid product. Extract the important skills, tools, and named requirements from the job description, then classify each as "matched" (the CV shows clear evidence of it, even if phrased differently) or "missing" (no reasonable evidence of it in the CV). Return every term you identify, most important first.`

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
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'keyword_scan',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                matched: { type: 'array', items: { type: 'string' } },
                missing: { type: 'array', items: { type: 'string' } },
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
  if (!content) {
    throw new Error('OpenAI returned no content')
  }

  const parsed = JSON.parse(content) as { matched: string[]; missing: string[] }
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

### `supabase/functions/stripe-webhook/index.ts` (complete draft)

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!stripeSecretKey || !webhookSecret) {
    return new Response('Billing is not configured', { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 })
  }

  const stripe = new Stripe(stripeSecretKey, {
    apiVersion: '2024-06-20',
    httpClient: Stripe.createFetchHttpClient(),
  })

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

  const { error: dedupeError } = await adminClient
    .from('stripe_webhook_events')
    .insert({ id: event.id })

  if (dedupeError) {
    if (dedupeError.code === '23505') {
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }
    console.error(`stripe-webhook: could not record event ${event.id}`, dedupeError)
    return new Response('Could not record event', { status: 500 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        await handlePackCheckoutCompleted(stripe, adminClient, event.data.object as Stripe.Checkout.Session)
        break
      }
      case 'charge.refunded': {
        await handleChargeRefunded(adminClient, event.data.object as Stripe.Charge)
        break
      }
      default:
        break
    }
  } catch (error) {
    console.error(`stripe-webhook: failed to handle ${event.type} (${event.id})`, error)
    return new Response('Webhook handler error', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

// FLAGGED: pre-correction draft. Does NOT verify session.payment_status,
// does NOT cross-check the Stripe Price ID/amount/currency against the
// expected pack configuration, and passes p_pack_id straight through from
// session metadata without independent re-derivation from actual line
// items. See Correction Log items 3, 4, 5.
async function handlePackCheckoutCompleted(
  stripe: Stripe,
  adminClient: ReturnType<typeof createClient>,
  session: Stripe.Checkout.Session,
) {
  const userId = session.client_reference_id
  const packId = session.metadata?.pack_id as 'small' | 'medium' | 'large' | undefined
  const paymentIntentId =
    typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id

  if (!userId || !packId || !paymentIntentId) {
    console.error('stripe-webhook: checkout.session.completed missing required fields', {
      userId,
      packId,
      paymentIntentId,
    })
    return
  }

  const { data, error } = await adminClient.rpc('grant_pack_credits', {
    p_user_id: userId,
    p_pack_id: packId,
    p_stripe_payment_intent_id: paymentIntentId,
    p_stripe_checkout_session_id: session.id,
    p_expires_at: session.metadata?.expires_at ?? null,
  })

  if (error) {
    console.error('stripe-webhook: grant_pack_credits failed', error)
    throw error
  }
}

async function handleChargeRefunded(adminClient: ReturnType<typeof createClient>, charge: Stripe.Charge) {
  const paymentIntentId =
    typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id

  if (!paymentIntentId) {
    console.error('stripe-webhook: charge.refunded missing payment_intent')
    return
  }

  const { data: batch } = await adminClient
    .from('credit_batches')
    .select('id, user_id, checks_remaining, keyword_scans_remaining')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()

  if (!batch) {
    console.error('stripe-webhook: charge.refunded -- no matching pack batch', paymentIntentId)
    return
  }

  if (batch.checks_remaining <= 0 && batch.keyword_scans_remaining <= 0) return

  const { data: profile } = await adminClient
    .from('profiles')
    .select('checks_balance')
    .eq('id', batch.user_id)
    .single()

  if (!profile) return

  const checksClawback = Math.min(batch.checks_remaining, profile.checks_balance)

  await adminClient
    .from('credit_batches')
    .update({
      checks_remaining: batch.checks_remaining - checksClawback,
      keyword_scans_remaining: 0,
    })
    .eq('id', batch.id)

  await adminClient
    .from('profiles')
    .update({ checks_balance: profile.checks_balance - checksClawback })
    .eq('id', batch.user_id)

  if (checksClawback > 0) {
    await adminClient.from('check_ledger').insert({
      user_id: batch.user_id,
      batch_id: batch.id,
      entry_type: 'refunded',
      amount: -checksClawback,
      credit_type: 'check',
      related_stripe_payment_intent_id: paymentIntentId,
      note: 'charge.refunded webhook clawback',
    })
  }
  if (batch.keyword_scans_remaining > 0) {
    await adminClient.from('check_ledger').insert({
      user_id: batch.user_id,
      batch_id: batch.id,
      entry_type: 'refunded',
      amount: -batch.keyword_scans_remaining,
      credit_type: 'keyword_scan',
      related_stripe_payment_intent_id: paymentIntentId,
      note: 'charge.refunded webhook clawback',
    })
  }
}
```

### `supabase/functions/request-refund/index.ts` (complete draft)

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import Stripe from 'npm:stripe@17.5.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://myrecruitercheck.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GUARANTEE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const RATE_LIMIT_BUCKET = 'request-refund'
const RATE_LIMIT_MAX = 5
const RATE_LIMIT_WINDOW_SECONDS = 3600

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }

    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeSecretKey) {
      return jsonResponse({ error: 'Billing is not configured' }, 503)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser()

    if (userError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey)

    const { data: rateLimitAllowed, error: rateLimitError } = await adminClient.rpc(
      'check_and_record_rate_limit',
      {
        p_user_id: user.id,
        p_bucket: RATE_LIMIT_BUCKET,
        p_limit: RATE_LIMIT_MAX,
        p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      },
    )

    if (rateLimitError) {
      console.error('request-refund: rate limit check failed', rateLimitError)
      return jsonResponse({ error: 'Could not process this request. Please try again.' }, 500)
    }
    if (!rateLimitAllowed) {
      return jsonResponse({ error: 'Too many refund requests. Please try again later.' }, 429)
    }

    // ---- Both credit types on the batch must be fully untouched,
    // server-side, never client-decided. ----
    const { data: batch, error: batchError } = await adminClient
      .from('credit_batches')
      .select(
        'id, checks_granted, checks_remaining, keyword_scans_granted, keyword_scans_remaining, stripe_payment_intent_id, granted_at',
      )
      .eq('user_id', user.id)
      .eq('source', 'purchase')
      .order('granted_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (batchError || !batch || !batch.stripe_payment_intent_id) {
      return jsonResponse({ error: 'No eligible purchase found for this account' }, 404)
    }

    const fullyUnused =
      batch.checks_remaining === batch.checks_granted &&
      batch.keyword_scans_remaining === batch.keyword_scans_granted

    if (!fullyUnused) {
      return jsonResponse(
        { error: 'This pack has already been used and is no longer refundable' },
        403,
      )
    }

    // ---- 7-day window enforced server side, never client-decided. ----
    const purchaseAgeMs = Date.now() - new Date(batch.granted_at).getTime()
    if (purchaseAgeMs > GUARANTEE_WINDOW_MS) {
      return jsonResponse({ error: 'The 7 day refund window for this pack has passed' }, 403)
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-06-20',
      httpClient: Stripe.createFetchHttpClient(),
    })

    const paymentIntent = await stripe.paymentIntents.retrieve(batch.stripe_payment_intent_id)
    if (paymentIntent.status !== 'succeeded') {
      return jsonResponse({ error: 'This purchase cannot be refunded' }, 409)
    }

    const existingRefunds = await stripe.refunds.list({
      payment_intent: batch.stripe_payment_intent_id,
      limit: 1,
    })
    if (existingRefunds.data.length > 0) {
      return jsonResponse({ error: 'This pack has already been refunded' }, 409)
    }

    await stripe.refunds.create({ payment_intent: batch.stripe_payment_intent_id })

    await adminClient
      .from('credit_batches')
      .update({ checks_remaining: 0, keyword_scans_remaining: 0 })
      .eq('id', batch.id)

    const { data: profile } = await adminClient
      .from('profiles')
      .select('checks_balance')
      .eq('id', user.id)
      .single()

    const checksClawback = Math.min(batch.checks_remaining, profile?.checks_balance ?? 0)

    if (profile) {
      await adminClient
        .from('profiles')
        .update({ checks_balance: profile.checks_balance - checksClawback })
        .eq('id', user.id)
    }

    await adminClient.from('check_ledger').insert([
      {
        user_id: user.id,
        batch_id: batch.id,
        entry_type: 'refunded',
        amount: -checksClawback,
        credit_type: 'check',
        related_stripe_payment_intent_id: batch.stripe_payment_intent_id,
        note: 'self-service request-refund',
      },
      {
        user_id: user.id,
        batch_id: batch.id,
        entry_type: 'refunded',
        amount: -batch.keyword_scans_remaining,
        credit_type: 'keyword_scan',
        related_stripe_payment_intent_id: batch.stripe_payment_intent_id,
        note: 'self-service request-refund',
      },
    ])

    return jsonResponse({ refunded: true })
  } catch (error) {
    console.error('request-refund error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
```

**Confirmed acceptable in principle (your own assessment, recorded):** the 7-day window and fully-unused checks both execute entirely server-side; the client never decides eligibility. **Outstanding, not yet done:** user-facing copy (Pricing page, refund explanation, Billing page) stating this rule — see the new requirement at the end of this document.

---

## Message 4B — Sections 16–17: client idempotency lifecycle (corrected classification) and deployment cutover

**Note:** this section reflects the corrected outcome classification from your review (non-terminal vs. terminal), not yet implemented in any code — it describes the design intent to carry into the final consolidated migration/edge function.

### Section 16 — Client idempotency-key lifecycle (corrected)

**Outcome classification, as corrected:**
- **Non-terminal** (client keeps and reuses the *same* key): `reserved` (scan is now running), `already_processing` (a scan under this exact key is already running elsewhere — e.g., a duplicate tab or a retried request that arrived twice).
- **Terminal** (client must generate a genuinely new key for any further attempt): `completed`/`replay_result` (a usable result exists), `result_expired` (result gone, must start over), `released` (the attempt is over, credit returned or correctly not restored), `no_credits`, and any controlled permanent validation failure (e.g., `invalid_result` once designed per Correction Log item 4).

**Key generation:** `crypto.randomUUID()` once per explicit "Scan for keywords" click.

**Key persistence:** held in component state and mirrored to `sessionStorage` for refresh-recovery, keyed by `(user_id, route/component)` so a shared browser cannot let a second signed-in user inherit a pending key from a prior session — the stored entry contains only the idempotency key string and reservation id, never CV text, job-description text, or result content.

**Polling while `already_processing`:** bounded polling with exponential backoff (e.g., start at 2s, cap at 10s, stop after a fixed number of attempts or a fixed wall-clock ceiling), surfacing a clear "still working" UI state — never unlimited rapid polling.

**Clearing:** the stored entry is deleted from `sessionStorage` on any terminal outcome.

### Section 17 — Deployment cutover (corrected, server-controlled)

Per your explicit 12-step structure:

1. **Complete production precondition audit** — the anonymised usage/role-graph queries already run and recorded in this review and in the Part B report.
2. **Deploy and verify Part B separately** — the trigger repair, approved and tested on the test project, deployed to production and verified in isolation before anything below.
3. **Temporarily prevent new Keyword Scan processing at the server** — a row in a small server-side `feature_flags`-style table (or a dedicated boolean check inside `reserve_keyword_scan` itself) that the RPC checks before doing anything else, returning a controlled `service_unavailable` outcome. **Not a client-only flag** — enforced inside the database function so it holds even if a stale frontend bundle is still being served. Implementation detail to finalize in the consolidated migration: exact flag storage and how the edge function checks it before calling the model.
4. **Allow already-started legacy scans to finish, or define reconciliation** — since the *old* `keyword-scan` edge function has no reservation concept at all, "already-started" for the old system means "a request currently in flight against the old code," which naturally finishes or fails on its own within its existing timeout; no in-flight state needs migrating because the old system persists nothing beyond incrementing `keyword_scans_consumed` at the very end of a successful call.
5. **Apply the backward-compatible Part A database migration** — additive schema + replaced function bodies; the still-live old edge function is unaffected by any of it.
6. **Deploy the verified Stripe webhook changes** — separately, after the items in Correction Log items 3–5 are resolved and re-reviewed.
7. **Deploy the new Keyword Scan edge function.**
8. **Run authenticated canary tests using a designated test account** — against production, using a real account you designate, before wider exposure.
9. **Deploy the frontend.**
10. **Re-enable Keyword Scans** — flip the switch from step 3 back off.
11. **Verify balances, reservations, logs and analytics** — spot-check `get_credit_summary` for the canary account, confirm a `keyword_scan_reservations` row was created and completed correctly, confirm analytics events fired without PII.
12. **Keep the safe rollback switch available during observation** — the same step-3 switch, left armable for a defined observation window after full rollout.

**Legacy-offset cutover proof (Correction Log item 8):** between step 5 (migration applied) and step 7 (new edge function deployed), the *old* edge function is still the only thing running for that slug and is the only thing that can write `keyword_scans_consumed` — nothing in the new schema is being read yet by any live code path, since the new RPCs are only reachable from the new edge function, not deployed until step 7. Step 7 is an atomic slug replacement (Supabase edge function deploys don't run old and new code concurrently for the same slug), so the old writer stops existing at that exact instant. Post-cutover verification: a repo-wide `grep` for `keyword_scans_consumed` confirming zero write sites remain, re-run as part of step 11.

---

## Message 5 — Sections 18–20: full test matrix, corrected non-destructive recovery plan, separation from Part B

*(Content as previously reviewed and accepted for Sections 18/20; Section 17's test matrix reference below is the same 22-scenario matrix already discussed, restated here for completeness — not yet executed against the corrected design.)*

### Section 18 (test matrix reference)
The 10 originally-approved scenarios (pack expiry during success/failure, concurrent final-credit reservation, double completion, double release, complete-after-release, release-after-completion, retry-while-processing, retry-after-completion, retry-after-expiry) plus your 12 additions (cross-user access, anon/authenticated RPC denial, service-role isolation, result-validation rejection set, cleanup preserving accounting fields, credit-order across batches + free, expired-batch exclusion, webhook idempotency, pack allowlist, reservation/completion failures not consuming a credit) — **none yet executed against this corrected design**, since every prior test run in this session was against the pre-correction draft.

### Section 19 — Revised non-destructive rollback and roll-forward recovery plan
As previously reviewed and accepted:
- **Before any production reservation exists:** full schema rollback is safe only if verified empty (`keyword_scan_reservations` row count = 0 and no `credit_batches` row has `keyword_scans_granted > 0`).
- **After any reservation exists — phased roll-forward, not destructive rollback:**
  - **Phase 1 (application):** server-controlled maintenance switch (same mechanism as cutover step 3), never a client-only flag; replay of already-completed results remains available; no new credit can be consumed while active.
  - **Phase 2 (function):** restore a prior verified version only if it understands the current schema and cannot grant unlimited access or double-spend — the pre-metered old edge function is explicitly **never** a valid target for this, since reviving it reintroduces unlimited-scans-for-purchasers.
  - **Phase 3 (data):** `keyword_scan_reservations`, credit-allocation columns, and every `check_ledger` entry retained permanently; deprecated objects marked unused only after reconciliation; data-bearing schema removal deferred to a later, separate cleanup migration after the retention period.

### Section 20 — Separation from Part B (accepted)
Part A's schema/RPCs (`keyword_scan_reservations`, `credit_batches.keyword_scans_*`, all seven functions) reference nothing from Part B's two migrations (`protect_profile_billing_fields()`, its trigger attachment). Part A's `expire_credit_batches` body is functionally independent of whether Part B has been applied to the same environment — it will simply remain silently broken for the `checks_balance` clawback (Part B's original bug) until Part B is separately deployed, which is why cutover step 2 places Part B strictly before Part A's migration.

---

## Correction Log — every preliminary issue raised during this review, not yet implemented

1. **Direct table access on `keyword_scan_reservations`.** Confirmed empirically that Supabase grants `anon`/`authenticated` full table privileges by default. Fix: remove the client `SELECT` policy; explicitly revoke `SELECT`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER` from `PUBLIC`, `anon`, `authenticated`; all access (including replay/status/result retrieval) goes through the RPCs, each of which must apply `result_expires_at > now()` before returning any cached result.
2. **No automatic stale-reservation reuse.** Remove `v_stale_after`, `v_reusing_row`, and the restore-and-reuse path entirely. `reserved` always returns `already_processing`; `completed` returns `replay_result` only while valid, else `result_expired`; `released` is terminal and never reused. A genuinely new scan requires a new key from an explicit user action. Abandoned-reservation recovery becomes a separate, service-only reconciliation mechanism — still to be designed, requiring: a timeout longer than the maximum legitimate edge function duration, proof no active attempt can still complete, whether an attempt token/generation number is needed, exact restoration logic (respecting expired-batch non-revival), idempotency, and rejection of a late completion arriving after reconciliation.
3. **Webhook idempotency needs a real database constraint**, not select-then-insert. Requires a unique constraint/index on the fulfilment identifier and an atomic insert/on-conflict pattern; a repeated webhook must return the *stored* values, not recalculate from the new request; a replay with a different user/pack/session/amount/currency must raise a controlled `fulfilment_conflict`, never silent success.
4. **Pack identity/amount must be verified against Stripe's own record**, not trusted from metadata alone — verify Price ID, paid amount, and currency against the expected pack configuration before granting. Also: **credits must not be granted before payment is confirmed** — trace confirmed `grant_pack_credits` is called from `checkout.session.completed` (not session creation, correcting my earlier misstatement), but the handler does not currently check `payment_status`; async-payment-method exposure is unverified from code alone. Tracked as a separate, narrower pre-existing concern, not folded into Part A.
5. **`complete_keyword_scan`'s `already_completed` branch must check `result_expires_at`** before returning `v_row.result` — currently does not, independent of `reserve_keyword_scan`'s own (correct) check.
6. **Result-array validation must require every element to be a JSON string** before extraction (currently `jsonb_array_elements_text` silently coerces non-strings). Regex email/phone checks are explicitly **not** a PII guarantee — this limitation must be stated honestly in the final documentation, not overclaimed. Clarify whether `matched_total`/`missing_total` represent all terms while `matched_terms`/`missing_terms` hold only the top three, and validate consistency between totals and `match_percent` accordingly without wrongly requiring array length to equal the total.
7. **Invalid completion must not strand a credit.** Replace the current "raise exception, leave `reserved`, hope for a second release call" pattern with one atomic outcome: validate → if invalid, release the exact reservation → restore the original credit if still valid (never revive an expired paid batch) → mark `released` → write the audit record → return a controlled `invalid_result` outcome — not dependent on a second network call succeeding.
8. **Ledger completeness.** `release_keyword_scan_reservation` does not currently write a `'released'` ledger entry despite the schema supporting it. Full intended ledger model (reservation/use/release/expiry/refund/manual-adjustment) and a uniqueness mechanism tying a ledger entry to its reservation (not a note string) still need to be specified.
9. **`release_keyword_scan_reservation` must return a structured outcome** (`released`/`already_released`/`already_completed`/`batch_expired_not_restored`/`reservation_not_found`), not `void` — an expired paid batch that could not be restored must never be silently reported as success.
10. **`get_credit_summary` naming/expiry accuracy.** Rename or split `valid_check_credits`/`valid_keyword_scan_credits` to remove ambiguity about whether they include free credits. Report next-expiry date and quantity separately per credit type (not one shared `next_expiry` that can hide a later Keyword Scan expiry behind an earlier Recruiter Check one); aggregate quantities across batches sharing the same expiry timestamp.
11. **`get_credit_summary` must return a controlled error**, not an empty result set, when the profile row doesn't exist.
12. **Deterministic grants for every function**, function-by-function, not assumed from one earlier example: revoke from `PUBLIC`/`anon`/`authenticated`, then grant only to `authenticated` for user-facing functions; explicit table-privilege revocation on `keyword_scan_reservations` per item 1; full owner/`SECURITY DEFINER`/fixed-`search_path`/fully-qualified-references audit per function, including whether `pg_temp` needs explicit exclusion.
13. **Database integrity constraints not yet added:** `credit_source` `NOT NULL`; `credit_source='paid' → batch_id NOT NULL`; `credit_source='free' → batch_id NULL`; `status='completed' → completed_at AND result_expires_at NOT NULL`; `status<>'completed' → result NULL`; a completed row may have `result = null` after cleanup (do not require permanent retention); whether `completed_at`/`result_expires_at` are cleared or left as-is on a released row — still to be decided and shown.
14. **Structural drift validation is incomplete.** Current checks only confirm selected columns exist. Must be extended to verify exact data types, nullability, defaults, CHECK constraints, foreign keys, the unique constraint, and allowed `status`/`credit_source` values — failing loudly on any incompatible pre-existing object, never silently accepting drift, and remaining safe on a second run.
15. **Paid-batch expiry consistency.** `reserve_keyword_scan` currently accepts a null-expiry batch as valid; `release`/`expire_credit_batches` treat null-expiry inconsistently. Audit whether any legitimate Keyword Scan batch can have a null expiry; if not, enforce non-null `expires_at` at the database level for purchase-sourced batches and remove the null-expiry branch; if a genuine non-expiring administrative source must exist, define it explicitly and make every function's behavior consistent with that definition — never let a malformed paid pack default to permanently valid.
16. **Profile-row existence must be checked explicitly** after every `perform ... for update` lock (`reserve_keyword_scan`, `grant_pack_credits`, `expire_credit_batches`) — currently assumed, not verified with `FOUND`, no controlled `profile_not_found` error.
17. **Lock-order deadlock risk.** `reserve_keyword_scan` locks profile-then-batch; `expire_credit_batches` locks batch-then-profile. Must redesign `expire_credit_batches` to lock profile-first, batch-second, matching `reserve_keyword_scan`'s order, with an explicit locking strategy shown for multiple users/batches, and a concurrency test running expiry and reservation simultaneously for the same user — `SKIP LOCKED` is not accepted as proof of deadlock-freedom on its own.
18. **Expiry ledger idempotency.** Add database-level protection (not just balances reaching zero) against duplicate `'expired'` ledger entries for the same batch/credit-type under repeated cron runs or concurrent workers.
19. **`expire_credit_batches` grants** must be shown explicitly: not executable by `PUBLIC`/`anon`/`authenticated`; confirmed available to the cron owner and any strictly required service role.
20. **`cleanup_expired_keyword_scan_results` final privilege state** must be explicitly confirmed: `PUBLIC`/`anon`/`authenticated` cannot execute; `service_role` only if operationally required; `postgres`/cron owner can execute — not left to accidental Supabase defaults.
21. **Cron idempotency** must be re-verified for both named jobs after every schema/body change — final command text, schedule, owning role, and active state confirmed unchanged by a second migration run.
22. **Stripe webhook verification checklist**, none yet fully implemented: valid signature (done), expected event type (done), `payment_status = 'paid'` (missing), expected checkout mode, correct Price ID, correct amount, correct currency, correct user mapping, known pack, unique fulfilment reference (partially done via `stripe_payment_intent_id` uniqueness, needs the atomic constraint from item 3).
23. **Cutover order must be server-controlled end-to-end**, not a client-only flag, and must explicitly sequence Part B before Part A's `expire_credit_batches` replacement, plus the Stripe webhook deployment as its own separately-approved step — reflected in the corrected Section 17 above, not yet executed.
24. **NEW — Pricing/Billing/refund-explanation copy requirement:** the Pricing page, the refund explanation, and the Billing page must clearly state that a pack is eligible for the seven-day self-service refund **only when neither its Recruiter Check credits nor its Keyword Scan credits have been used.** Not yet written.

---

**Nothing in this document has been applied to any database, deployed, committed, or pushed.** This is the complete review package for your approval. The corrected production-candidate migration will be produced as a separate step once you've reviewed everything above.
