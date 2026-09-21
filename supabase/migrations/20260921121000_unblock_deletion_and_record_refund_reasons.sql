-- ============================================================================
-- Let checks and accounts be deleted, and let refund reasons be saved.
--
-- Found in the 2026-09-21 production audit, reproduced on a local replay of
-- every migration in this directory.
--
-- 1. check_ledger.related_check_id referenced checks with no ON DELETE
--    action, so every check paid for from a pack (it has a 'used' ledger
--    entry) could not be deleted: delete-check removed the CV and documents,
--    then the row delete failed on the foreign key and the user got an
--    error. The ledger entry keeps its amount and loses only the link.
--
-- 2. refund_events.user_id and batch_id had no ON DELETE action, and
--    refund_events is not part of any cascade, so deleting the account of
--    anyone who had ever been refunded failed after their files were gone.
--    The refund record is kept, detached from the deleted user, so the
--    accounting trail survives (Stripe holds the payment itself).
--    FOUNDER DECISION RECORDED AS PENDING: keeping a detached record is the
--    least destructive choice that unblocks deletion. If refund records
--    should instead be deleted with the account, change both to CASCADE.
--
-- 3. analytics_events.user_id, analyze_requests.user_id and
--    keyword_scan_canary_users.user_id have no ON DELETE action in the
--    schema this directory rebuilds. memory/ records that production
--    cascades analytics_events on user deletion; these statements make the
--    repository say the same thing, and are a no-op where production already
--    does. Constraint names are the ones in src/types/database.ts.
--
-- 4. request-refund saved the customer's optional refund reason with an
--    UPDATE on refund_events, but service_role holds SELECT only there (and
--    20260905130000 asserts exactly that), so every reason since 2026-08-31
--    was dropped with a logged permission error. record_refund_reason is a
--    narrow definer function that writes those two columns and nothing else.
--
-- 5. Indexes for the two maintenance queries that run all day (the stale
--    check sweep every 5 minutes, the upload purge every 15) and for the
--    foreign keys above, which are checked on every user deletion.
-- ============================================================================

-- 1 --------------------------------------------------------------------------
alter table public.check_ledger drop constraint if exists check_ledger_related_check_id_fkey;
alter table public.check_ledger
  add constraint check_ledger_related_check_id_fkey
  foreign key (related_check_id) references public.checks (id) on delete set null;

-- 2 --------------------------------------------------------------------------
alter table public.refund_events
  alter column user_id drop not null,
  alter column batch_id drop not null;
alter table public.refund_events
  drop constraint if exists refund_events_user_id_fkey,
  drop constraint if exists refund_events_batch_id_fkey;
alter table public.refund_events
  add constraint refund_events_user_id_fkey
    foreign key (user_id) references public.profiles (id) on delete set null,
  add constraint refund_events_batch_id_fkey
    foreign key (batch_id) references public.credit_batches (id) on delete set null;

-- 3 --------------------------------------------------------------------------
alter table public.analytics_events drop constraint if exists analytics_events_user_id_fkey;
alter table public.analytics_events
  add constraint analytics_events_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.analyze_requests drop constraint if exists analyze_requests_user_id_fkey;
alter table public.analyze_requests
  add constraint analyze_requests_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

alter table public.keyword_scan_canary_users drop constraint if exists keyword_scan_canary_users_user_id_fkey;
alter table public.keyword_scan_canary_users
  add constraint keyword_scan_canary_users_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;

-- 4 --------------------------------------------------------------------------
create or replace function public.record_refund_reason(
  p_refund_event_id uuid,
  p_reason text,
  p_reason_detail text
)
returns void
language sql
security definer
set search_path = ''
as $function$
  -- The reason and detail are checked by refund_events_reason_check and
  -- refund_events_reason_detail_length_check. Only a succeeded refund can
  -- carry one, and an existing reason is never overwritten.
  update public.refund_events
  set reason = p_reason,
      reason_detail = p_reason_detail
  where id = p_refund_event_id
    and status = 'succeeded'
    and reason is null
$function$;

revoke execute on function public.record_refund_reason(uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_refund_reason(uuid, text, text) to service_role;

-- 5 --------------------------------------------------------------------------
create index if not exists checks_processing_updated_at_idx
  on public.checks (updated_at)
  where status = 'processing';

create index if not exists checks_purge_pending_created_at_idx
  on public.checks (created_at)
  where uploads_purged = false or documents_purged = false;

create index if not exists analytics_events_user_id_idx on public.analytics_events (user_id);
create index if not exists refund_events_user_id_idx on public.refund_events (user_id);

-- Post-conditions -----------------------------------------------------------
do $$
declare
  v_bad text;
begin
  select string_agg(conrelid::regclass || '.' || conname, ', ')
    into v_bad
  from pg_constraint
  where contype = 'f'
    and conname in (
      'check_ledger_related_check_id_fkey', 'refund_events_user_id_fkey', 'refund_events_batch_id_fkey',
      'analytics_events_user_id_fkey', 'analyze_requests_user_id_fkey', 'keyword_scan_canary_users_user_id_fkey'
    )
    and confdeltype not in ('c', 'n');
  if v_bad is not null then
    raise exception 'foreign keys still block deletion: %', v_bad;
  end if;

  -- 20260905130000's own assertion must still hold: service_role reads
  -- refund_events and writes it only through definer functions.
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'refund_events'
      and grantee = 'service_role' and privilege_type <> 'SELECT'
  ) then
    raise exception 'service_role holds more than SELECT on refund_events';
  end if;

  if has_function_privilege('authenticated', 'public.record_refund_reason(uuid, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.record_refund_reason(uuid, text, text)', 'EXECUTE') then
    raise exception 'record_refund_reason is executable by a client role';
  end if;
end $$;
