=== V4.1 Item 2: reconciliation execution + schema-equivalence results ===

Byte-for-byte reserve_refund body check: IDENTICAL (md5 2c15cddf6ca9bfc4649d5c44c440af95 both files)

Apply 1 exit code: 0
Apply 2 exit code: 0 (idempotent)

Fixture preservation: 7/7 representative rows preserved across both applies

Structural diff vs 01_production_migration.sql's resulting schema:
  columns, constraints, indexes, policies, table grants, function grants, function bodies (17 functions) -- 0 unexplained differences

One explained intentional difference: stripe_webhook_events legacy-row backfill
(01 audits/backfills the one known production row evt_1U4ONvPoeQ54WTPbxXvOEva6;
02 skips this because the test project has 0 rows -- documented in 02's own Step 10 comment)

Real bugs found via actual execution (not inspection) and fixed:
1. reserve_refund ambiguous batch_id column (both 01 and 02) -- broke 100% of refund calls
2. 02 Step 10: RAISE EXCEPTION with % placeholder, no argument -- PL/pgSQL compile-time failure
3. 02 Step 8/Section B: missing keyword_scans_granted/keyword_scans_remaining columns entirely
   -- confirmed via a REAL runtime failure of reserve_keyword_scan, not just static diff
4. 02: missing 3 CHECK constraints on keyword_scan_reservations (credit_source, idempotency_key, status)
5. 02: missing 4 performance indexes (credit_batches_user_expiry_ks_idx, keyword_scan_reservations_cleanup_idx,
   keyword_scan_reservations_reconcile_idx, refund_events_batch_idx)

Unresolved, flagged (not silently patched): credit_batches_purchase_verified_facts_check has no backfill
path for pre-existing purchase-source rows, in BOTH 01 and 02 -- will fail on first apply against any
database with real existing purchase batches lacking stripe_price_id/amount_paid/currency/quantity/paid_at.
