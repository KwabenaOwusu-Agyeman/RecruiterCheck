-- ============================================================================
-- Keep each refund's facts on the refund record itself.
--
-- 20260921121000 made refund_events survive account deletion (user_id and
-- batch_id are set to NULL), but the amount, currency and pack lived only on
-- credit_batches, which is deleted with the account. A detached refund row
-- therefore said that a refund happened and nothing about it. Founder
-- decision 2026-09-22: keep the trail, with its amounts.
--
-- 1. Four columns copied from the batch: amount_paid, currency, pack_id and
--    stripe_payment_intent_id (the last lets a detached refund still be
--    matched to Stripe).
-- 2. A BEFORE INSERT trigger fills them from the batch for every new refund,
--    whichever function inserts it (reserve_refund, recover_external_refund),
--    so no refund function had to change.
-- 3. A backfill for every existing row whose batch still exists. A refund
--    whose account was deleted after 20260921121000 was applied and before
--    this one has nothing left to copy from and stays empty; Stripe holds it.
--
-- service_role keeps SELECT only on refund_events (20260905130000's
-- assertion still holds): the copy is written by the trigger and this
-- migration, never by a client or an Edge Function.
-- ============================================================================

alter table public.refund_events
  add column if not exists amount_paid integer,
  add column if not exists currency text,
  add column if not exists pack_id text,
  add column if not exists stripe_payment_intent_id text;

comment on column public.refund_events.amount_paid is
  'Copied from credit_batches at insert, in minor units, so the refund keeps its amount after the account (and its batch) is deleted.';

create or replace function public.snapshot_refund_batch_facts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.batch_id is not null then
    select cb.amount_paid, cb.currency, cb.pack_id, cb.stripe_payment_intent_id
      into new.amount_paid, new.currency, new.pack_id, new.stripe_payment_intent_id
      from public.credit_batches cb
      where cb.id = new.batch_id;
  end if;
  return new;
end;
$function$;

revoke execute on function public.snapshot_refund_batch_facts() from public, anon, authenticated;

drop trigger if exists refund_events_snapshot_batch_facts on public.refund_events;
create trigger refund_events_snapshot_batch_facts
before insert on public.refund_events
for each row execute function public.snapshot_refund_batch_facts();

update public.refund_events re
set amount_paid = cb.amount_paid,
    currency = cb.currency,
    pack_id = cb.pack_id,
    stripe_payment_intent_id = cb.stripe_payment_intent_id
from public.credit_batches cb
where cb.id = re.batch_id
  and re.amount_paid is null;

-- Post-conditions -----------------------------------------------------------
do $$
declare
  v_missing integer;
begin
  select count(*) into v_missing
  from public.refund_events re
  join public.credit_batches cb on cb.id = re.batch_id
  where cb.source = 'purchase'
    and (re.amount_paid is null or re.currency is null or re.stripe_payment_intent_id is null);
  if v_missing > 0 then
    raise exception '% refund row(s) with a purchase batch were not snapshotted', v_missing;
  end if;

  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'refund_events'
      and grantee = 'service_role' and privilege_type <> 'SELECT'
  ) then
    raise exception 'service_role holds more than SELECT on refund_events';
  end if;

  if has_function_privilege('authenticated', 'public.snapshot_refund_batch_facts()', 'EXECUTE') then
    raise exception 'snapshot_refund_batch_facts is executable by a client role';
  end if;
end $$;
