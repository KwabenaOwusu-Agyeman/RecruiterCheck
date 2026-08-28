-- ============================================================================
-- READ-ONLY preflight query. Run this against a cloud project IMMEDIATELY
-- BEFORE applying 01_production_migration.sql or 02_test_reconciliation.sql
-- to that project -- never rely on a historical run of this query, always
-- recheck at deployment time. This query performs no writes (it only reads
-- information_schema and credit_batches, and only via SELECT).
--
-- Output is restricted to counts and batch ids only -- no customer
-- information, no full Stripe objects.
--
-- If "incompatible_purchase_row_count" is greater than 0: STOP. Do not apply
-- the migration. Do not repair the row(s) without separate, explicit
-- approval.
--
-- Safe to run whether or not the new columns (stripe_price_id, amount_paid,
-- currency, quantity, paid_at) already exist on this project -- checks each
-- column's existence dynamically rather than assuming the post-migration
-- shape.
-- ============================================================================
do $$
declare
  v_has_price boolean;
  v_has_amount boolean;
  v_has_currency boolean;
  v_has_quantity boolean;
  v_has_paid_at boolean;
  v_purchase_count integer;
  v_incompatible_count integer;
  v_incompatible_ids uuid[];
  v_source_counts text;
  v_sql text;
begin
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='stripe_price_id') into v_has_price;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='amount_paid') into v_has_amount;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='currency') into v_has_currency;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='quantity') into v_has_quantity;
  select exists (select 1 from information_schema.columns where table_schema='public' and table_name='credit_batches' and column_name='paid_at') into v_has_paid_at;

  select count(*) into v_purchase_count from public.credit_batches where source = 'purchase';

  v_sql := 'select count(*), coalesce(array_agg(id order by id), array[]::uuid[]) from public.credit_batches where source = ''purchase'' and (' ||
    'stripe_payment_intent_id is null or stripe_checkout_session_id is null or pack_id is null or expires_at is null' ||
    case when v_has_price then ' or stripe_price_id is null' else ' or true' end ||
    case when v_has_amount then ' or amount_paid is null' else ' or true' end ||
    case when v_has_currency then ' or currency is null' else ' or true' end ||
    case when v_has_quantity then ' or quantity is null' else ' or true' end ||
    case when v_has_paid_at then ' or paid_at is null' else ' or true' end ||
    ')';

  execute v_sql into v_incompatible_count, v_incompatible_ids;

  select string_agg(source || '=' || cnt, ', ' order by source) into v_source_counts
  from (select source, count(*) as cnt from public.credit_batches group by source) s;

  raise notice 'PREFLIGHT: new verified-fact columns present on this project -- stripe_price_id=%, amount_paid=%, currency=%, quantity=%, paid_at=%',
    v_has_price, v_has_amount, v_has_currency, v_has_quantity, v_has_paid_at;
  raise notice 'PREFLIGHT: purchase_row_count=%, incompatible_purchase_row_count=%, source_counts=%',
    v_purchase_count, v_incompatible_count, coalesce(v_source_counts, '(no rows)');

  if v_incompatible_count > 0 then
    raise notice 'PREFLIGHT: incompatible_batch_ids=%', v_incompatible_ids;
    raise notice 'PREFLIGHT RESULT: STOP -- % incompatible purchase row(s) exist. Do not apply the migration. Do not repair without separate explicit approval.', v_incompatible_count;
  else
    raise notice 'PREFLIGHT RESULT: OK -- 0 incompatible purchase rows out of % total purchase row(s).', v_purchase_count;
  end if;

  -- Note: if new columns do not yet exist on this project (v_has_price
  -- etc. are all false), every existing purchase row is necessarily
  -- classified incompatible by the ' or true' branches above, matching
  -- exactly how the migration's own in-transaction precondition will
  -- behave once it adds those columns and re-checks -- this preflight is
  -- deliberately at least as strict as the migration itself, never looser.
end $$;
