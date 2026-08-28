# Deployment & Rollback Runbook — Part A (Review Draft, Not Executed)

## Deployment sequence (fail-closed, per Item L)

1. Obtain separate approval for, and deploy, **Part B** (trigger repair) to production.
2. Verify Part B in production (re-run the byte-comparison + role-graph queries from the Part B report against production).
3. Deploy `keyword-scan-maintenance-stub.ts` to the **production** `keyword-scan` slug. This is the only version of that slug reachable by real users from this point forward until step 9.
4. Apply `01_production_migration.sql` to production. Its `feature_flags.keyword_scan_maintenance` row defaults to `true` (blocking) — confirmed by the migration's own Section A verification block, which fails the whole migration if that default is ever anything other than `true`.
5. Deploy the real implementation (`keyword-scan.ts`) to a **separate canary slug** (`keyword-scan-canary`), not the production `keyword-scan` slug. Add designated test-account `user_id`s to `keyword_scan_canary_users`. The canary function itself checks this allowlist before doing anything else (implementation note: add the same allowlist check used by `reserve_keyword_scan`'s maintenance check, keyed off `keyword_scan_canary_users` instead of `keyword_scan_maintenance`, inside the canary slug specifically — not shown as a separate file in this package since it's the same `keyword-scan.ts` body with one additional `select 1 from keyword_scan_canary_users where user_id = auth.uid()` guard at the top).
6. Run authenticated canary tests against `keyword-scan-canary`. The public `keyword-scan` slug remains the maintenance stub throughout — ordinary users cannot reach any real implementation, canary or otherwise, during this window.
7. Verify database state, grants (§13 permission matrix), expiry, webhook, and refund behavior via the queries in `04_structural_verification.sql` and the test SQL in `03_test_assertions.sql`.
8. Deploy `keyword-scan.ts` (the real implementation) to the **production** `keyword-scan` slug, replacing the maintenance stub. `feature_flags.keyword_scan_maintenance` is still `true` at this point — the newly-deployed real function is live but still blocks every request via its own internal check.
9. **Only after step 8 is independently verified**, flip `feature_flags.keyword_scan_maintenance` to `false`. This is the single, explicit, deliberate moment public access begins — never implicit, never a side effect of a deploy.
10. Deploy the frontend.
11. Monitor: Stripe webhook retry counts (`stripe_webhook_events` rows with `status='failed'` or repeated `attempt_count`), `reconcile_abandoned_keyword_scan_reservations`'s `reconciled_count` per run, `reconcile-ambiguous-refunds`'s `stillAmbiguous` count, and standard error-rate metrics for the new edge functions.

## Rollback (roll-forward preferred; destructive rollback only pre-traffic)

- **Before any production reservation exists:** verify `select count(*) from keyword_scan_reservations` and `select count(*) from credit_batches where keyword_scans_granted > 0` are both `0`; if so, a full schema rollback (drop the new objects, restore prior function bodies) is safe.
- **After any reservation exists:** Phase 1 — flip `feature_flags.keyword_scan_maintenance` back to `true` (the same switch used for cutover). Phase 2 — restore a prior verified function version only if it understands the current schema and cannot grant unlimited access or double-spend; the pre-metered legacy `keyword-scan` implementation is never a valid rollback target. Phase 3 — `keyword_scan_reservations`, `refund_events`, and every `check_ledger`/`credit_batches` row are retained permanently; schema removal is deferred to a later, separate cleanup migration.

## Concurrency test procedure (two simultaneous sessions — not expressible in a single linear SQL script)

Run in two separate `psql`/Supabase SQL-editor sessions against the test project, timed manually:

- **Session A:** `begin; select 1 from profiles where id = '<user>' for update;` (hold the transaction open).
- **Session B:** attempt `select public.expire_credit_batches();` — confirm it blocks (waits) rather than erroring or deadlocking, then confirm it proceeds once Session A commits.
- Repeat with Session A holding a lock via `reserve_keyword_scan` mid-transaction (requires temporarily commenting out the function's own commit boundary or using `pg_sleep` inside a modified test copy) and Session B running `reconcile_abandoned_keyword_scan_reservations`.
- **Webhook fencing (Item D):** Session A calls `claim_stripe_webhook_event('evt_test_1', 'checkout.session.completed')`, captures its `claim_token`, does NOT call complete/fail. Manually backdate its `lease_expires_at` to the past (`update stripe_webhook_events set lease_expires_at = now() - interval '1 minute' where id = 'evt_test_1';`). Session B calls `claim_stripe_webhook_event` again for the same event id — should get `retry_claimed` with a NEW token. Session A then calls `complete_stripe_webhook_event('evt_test_1', <its old token>)` — must return `stale_claim`.

## Environment configuration checklist (Item 28)

- Production Supabase project: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` = live-mode; `STRIPE_PACK_PRICE_CONFIG` = the three live Price IDs already in use.
- `myrecruitercheck-scoring-test`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` = **test-mode only**; `STRIPE_PACK_PRICE_CONFIG` = three **test-mode** Price IDs from a separate Stripe test-mode product catalog you create in the Stripe Dashboard (outside my access — I cannot create these).
- Both `create-checkout-session.ts` and `stripe-webhook.ts` fail closed (503, or event marked `permanently_invalid`/retryable-fail) if `STRIPE_PACK_PRICE_CONFIG` is absent or malformed for either project.

## What I did NOT execute

- No SQL in this package has been run against any database.
- No edge function has been deployed.
- Static validation performed: attempted `npx tsc --noEmit` against the edge function files for syntax-level parsing only (Deno-specific globals and `npm:`/`https://esm.sh/` imports are not resolvable by `tsc`, so this cannot confirm full type-correctness — only that the files parse as syntactically valid TypeScript). `deno` itself is not installed in this environment, so `deno check`/`deno test`/`deno fmt` were not run. Results below.
