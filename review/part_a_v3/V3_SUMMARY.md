# Part A — V3 Review Package Summary

**Location:** `/Users/Other/Projects/RecruiterCheck/review/part_a_v3/` (isolated, review-only — no actual implementation path under `supabase/` or `src/` has been touched).

**Nothing has been applied, deployed, committed, or pushed.**

## 1. Instruction → candidate file mapping

| Instruction | File | Section |
|---|---|---|
| Founder decision 1-3: URL enabled, SSRF fixes, DNS-rebinding accepted | `edge-functions/extract-job-url.ts` | credential rejection + multicast/reserved ranges inline; DNS-rebinding note in `fetchWithSsrfGuard` docstring |
| Founder decision 4: test = Stripe test mode only | `edge-functions/price-config.ts`, `RUNBOOK.md` | env-driven `STRIPE_PACK_PRICE_CONFIG`, fail-closed |
| Founder decision 5: Part B first, separate | `RUNBOOK.md` | Deployment sequence step 1-2 |
| Founder decision 6: real ToS read | `frontend/TOS_CONFLICT_REPORT.md` | full |
| A: real, complete files | this entire directory | — |
| B: global lock order | `01_production_migration.sql` Sections H, I, J, K | every function |
| C: lease ownership fix | `01_production_migration.sql` Section E, I; `frontend/useKeywordScanIdempotency.ts` | `lease_expires_at`, `poll_keyword_scan_status` |
| D: webhook fencing token | `01_production_migration.sql` Section G; `edge-functions/stripe-webhook.ts` | `claim_token` |
| E: webhook migration completeness | `01_production_migration.sql` Section D | strict backfill precondition |
| F: fulfilment verification | `01_production_migration.sql` Section H; `edge-functions/stripe-webhook.ts`, `create-checkout-session.ts` | Price ID authority, no timestamp fallback |
| G: ambiguous refund handling | `01_production_migration.sql` Section K; `edge-functions/request-refund.ts`, `reconcile-ambiguous-refunds.ts` | pending-on-ambiguity, actual Refund ID |
| H: refund lock order | `01_production_migration.sql` Section K | pre-read → profile → batch → refund_event |
| I: cached result validation | `01_production_migration.sql` Section I (`complete_keyword_scan`) | 20-item cap, JSON-type checks |
| J: deterministic grants | `01_production_migration.sql` (every `revoke all ... grant`) | §13 below |
| K: Terms/refund copy | `frontend/refund-copy-placement.md`, `frontend/TOS_CONFLICT_REPORT.md` | full |
| L: fail-closed cutover | `RUNBOOK.md` | Deployment sequence |
| M: testing | `03_test_assertions.sql`, `edge-functions/extract-job-url.test.ts`, `RUNBOOK.md` (manual concurrency steps) | full |

## 2. Complete file list

```
review/part_a_v3/
  01_production_migration.sql          (1285 lines, literal, no forward references)
  02_test_reconciliation.sql           (1176 lines, literal, self-contained)
  03_test_assertions.sql
  RUNBOOK.md
  V3_SUMMARY.md
  edge-functions/
    extract-job-url.ts                 (corrected: 2 SSRF fixes applied)
    extract-job-url.test.ts
    keyword-scan.ts
    keyword-scan-maintenance-stub.ts
    stripe-webhook.ts
    request-refund.ts
    reconcile-ambiguous-refunds.ts
    create-checkout-session.ts
    price-config.ts
  frontend/
    useKeywordScanIdempotency.ts
    refund-copy-placement.md
    TOS_CONFLICT_REPORT.md
```

## 3. Static validation results (actually run, honestly reported)

**SQL:** No local Postgres/psql parser was available in this environment to lint the `.sql` files without executing them (which is prohibited pre-approval). Both SQL files were reviewed manually for balanced `$$`/`begin...end`/parenthesis structure; no automated parse-check was run. **This is a genuine gap** — the first real syntax validation will happen when `01_production_migration.sql`/`02_test_reconciliation.sql` are actually applied to the test project, which requires your approval first.

**TypeScript:** ran `npx tsc --noEmit --allowJs --target es2022 --module esnext --skipLibCheck` against every `.ts` file in `edge-functions/` and `frontend/`. Result: every reported error is one of two expected, harmless categories —
1. `Cannot find module 'npm:...'`/`'https://esm.sh/...'` and `Cannot find name 'Deno'` — expected, since `tsc` has no Deno runtime types or remote-module resolution; these are not real errors, just environment mismatch (the actual Deno deploy runtime resolves these natively).
2. Two `Property 'text'/'value' does not exist on type 'unknown'` errors in `keyword-scan.ts`'s `extractText` function — caused by the same upstream `npm:unpdf`/`npm:mammoth` types failing to resolve under `tsc`, which cascades into implicit `unknown` return types. **This is not a new defect** — it reproduces the exact same untyped pattern already present in the current, live, production `keyword-scan/index.ts` (unchanged logic, just copied structure) when checked outside a real Deno environment.

No genuine syntax errors were found. `deno check`/`deno test`/`deno fmt` could not be run — `deno` is not installed in this session's environment.

## 4. Genuinely unresolved blockers — not silently marked resolved

1. **SQL files have not been executed anywhere** — no real database has parsed or run them. Section-by-section internal consistency was checked by construction (each section's `do $$ ... raise exception` verification blocks), but this is not the same as a real `apply_migration` dry run.
2. **Concurrency/deadlock tests are not executable as a single script.** `03_test_assertions.sql` includes a static source-inspection proxy (`T-LOCK-1`) for lock ordering, but the true dynamic two-session deadlock test is documented as a manual procedure in `RUNBOOK.md` and has not been run.
3. **Stripe test-mode Price IDs do not exist yet.** I cannot create them — this requires your action in the Stripe Dashboard before `myrecruitercheck-scoring-test`'s `STRIPE_PACK_PRICE_CONFIG` secret can be set to anything real, and before any Stripe-integration test in the M list involving actual API calls can run.
4. **Terms of Service replacement language is explicitly not drafted** — `TOS_CONFLICT_REPORT.md` documents the real conflict; I need your direction before proposing a diff.
5. **`reconcile-ambiguous-refunds` and `expire-credit-batches`/`cleanup`/`reconcile-abandoned-keyword-scans` cron/scheduling mechanism** — the three original cron jobs use `pg_cron` directly (already proven working in this project). `reconcile-ambiguous-refunds` is an HTTP-invoked edge function (it needs live Stripe API access, which a `pg_cron`-scheduled plpgsql function cannot make) — its actual invocation mechanism (a `pg_cron` job using `pg_net` to call the function's URL on a schedule, versus an external scheduler) is not fully specified in this package and needs a decision before deployment.
6. **Canary-slug allowlist check inside `keyword-scan.ts`** — `RUNBOOK.md` step 5 describes adding one guard clause to the same file for the canary deployment, but I have not produced a separate literal `keyword-scan-canary.ts` file with that guard already written in — flagging this as an incomplete deliverable against instruction A's "no omitted bodies" standard, to be produced before canary deployment specifically (not before your review of everything else).

Everything else in the tracked instruction list (B through M, founder decisions 1-6 except the ToS text itself) has actual candidate code and, where an automated single-script test is feasible, an actual test in `03_test_assertions.sql` or `extract-job-url.test.ts` — not merely documentation.

Awaiting your review before applying anything.
