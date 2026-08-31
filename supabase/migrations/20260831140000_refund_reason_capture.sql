-- ============================================================================
-- Optional refund reason capture.
--
-- refund_events records that a refund happened and its Stripe id, but nothing
-- about why. That is the one piece of product signal a refund carries, and it
-- is lost today.
--
-- Both columns are NULLABLE and stay that way. A reason must never be a
-- precondition for a refund: an unused pack inside the guarantee window is
-- refundable whether or not the customer says why, and requiring a reason for
-- what may be a statutory withdrawal would not be enforceable anyway. The
-- schema encodes that — there is no NOT NULL and no default.
--
-- Written by request-refund after finalize_refund has already succeeded, so a
-- failure to record the reason can never affect whether the money moves.
-- ============================================================================

alter table public.refund_events
  add column if not exists reason text,
  add column if not exists reason_detail text;

-- A fixed vocabulary, so this stays aggregatable instead of turning into free
-- text with three spellings of the same thing. 'something_else' is the escape
-- hatch and is the only value that expects reason_detail alongside it.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.refund_events'::regclass
      and conname = 'refund_events_reason_check'
  ) then
    alter table public.refund_events add constraint refund_events_reason_check
      check (reason is null or reason in (
        'wrong_pack',
        'changed_mind',
        'not_what_i_expected',
        'something_else'
      ));
  end if;
end $$;

-- Free text is a customer-authored field on a table that is otherwise all
-- system-generated, so it is length-bounded at the schema level rather than
-- trusting the client.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.refund_events'::regclass
      and conname = 'refund_events_reason_detail_length_check'
  ) then
    alter table public.refund_events add constraint refund_events_reason_detail_length_check
      check (reason_detail is null or length(reason_detail) <= 500);
  end if;
end $$;

comment on column public.refund_events.reason is
  'Optional, customer-selected. Never required: a refund is never gated on giving one.';
comment on column public.refund_events.reason_detail is
  'Optional free text, max 500 chars. Customer-authored, so treat as untrusted when displaying.';
