# Part A — V4.1 final report (Items 4–9, delta from the last approved state)

Items 1–3 and the purchase-row precondition correction were already reviewed and approved in earlier turns this session. This report covers Items 4–7 (completed this turn) plus the required closing items 8–9. **Nothing was applied to either Supabase cloud project. No deployment, commit, or push.**

## Item 4 — real Stripe environment guard, 13 tests (8 required + 5 additional)

Rewrote [price-config.ts](edge-functions/price-config.ts) from a static, prefix-trusting config loader into a real verifying guard:
- `getStripeEnvironment()` throws unless `STRIPE_ENVIRONMENT` is exactly `test` or `production` — no default.
- `assertSecretKeyMatchesEnvironment()` throws on any `sk_test_`/`sk_live_` mismatch against the declared environment, in both directions.
- `loadAndVerifyPriceConfig()` parses `STRIPE_PACK_PRICE_CONFIG`, then **retrieves every configured Price from Stripe** via `stripe.prices.retrieve()` and checks it's active, one-time (not recurring), the expected currency, and the expected amount — never inferring anything from the Price ID string. A cross-mode/cross-account Price ID (Stripe returns "no such price") is treated as an ordinary verification failure, not a special case.
- Per-instance cached (verification does real API calls, so it runs once per cold start, not once per request); a failed verification is never cached, so a transient Stripe outage doesn't permanently wedge the instance.
- Never logs the secret key itself.

Wired the guard into [create-checkout-session.ts](edge-functions/create-checkout-session.ts) and [stripe-webhook.ts](edge-functions/stripe-webhook.ts), replacing the old module-level `PACK_PRICE_MAP` constant.

**Tests** (`edge-functions/price-config.test.ts`), real execution, command: `deno test --allow-env edge-functions/price-config.test.ts` — **13/13 pass**. Covers all 8 required scenarios (missing environment, live key in test, malformed config, duplicate prices, wrong amount, wrong currency, recurring Price, inactive Price) plus 5 extra edge cases (converse key/environment mismatch, correctly-matched pair, config entirely absent, a fully valid config, cross-mode retrieval failure).

## Item 5 — scheduler structural validation + real read-only `pg_net` check

Full results in [SCHEDULER_VALIDATION.md](SCHEDULER_VALIDATION.md). Highlights:
- **`pg_net` status on `myrecruitercheck-scoring-test`, checked for real via `list_extensions` (read-only):** not installed (`installed_version: null`). `pg_cron` is (`1.6.4`). Confirms `04_scheduler_migration.sql`'s own precondition would correctly fire if applied today.
- **Duplicate-cron-job safety on rerun:** verified against real pg_cron documentation, not assumed — the named `cron.schedule(job_name, ...)` overload is an upsert, idempotent since pg_cron 1.3 ([Citus](https://www.citusdata.com/blog/2020/10/31/evolving-pg-cron-together/), corroborated by [Microsoft Community Hub](https://techcommunity.microsoft.com/blog/adforpostgresql/evolving-pg-cron-together-postgres-13-audit-log-background-workers--job-names/1829588)). Test project runs 1.6.4.
- **Real bug found and fixed:** `reconcile-ambiguous-refunds.ts`'s auth check was fail-*open* — `if (cronSecret && header !== cronSecret)` skipped auth entirely whenever `CRON_INVOKE_SECRET` was unset, making the refund-mutating endpoint publicly callable. Fixed to fail closed (503) when the secret isn't configured.
- **Failed HTTP invocation never mutates refund/credit state:** verified by construction — a failed pg_net→function delivery means the function's code never runs at all; a failed in-function Stripe lookup is caught and only increments a counter, never calls `fail_refund`/`finalize_refund`.
- Bounded timeout (30s) and no-plaintext-credentials-in-`cron.job` both confirmed by inspection.

## Item 6 — canary tests, 10/10 required scenarios

Refactored [keyword-scan-canary.ts](edge-functions/keyword-scan-canary.ts) to expose a testable `handleCanaryRequest(req, {userClient, adminClient})`, guarded the `Deno.serve` wrapper behind `import.meta.main` (same fix applied to `keyword-scan.ts`, which had the identical unguarded-listener defect — merely importing it for `handleKeywordScanRequest` previously started a real HTTP server and crashed under `deno test`'s sandbox).

**Tests** (`edge-functions/keyword-scan-canary.test.ts`), command: `deno test --allow-env --allow-read edge-functions/keyword-scan-canary.test.ts` — **10/10 pass**: missing JWT, invalid JWT, non-allowlisted user, allowlisted user, empty allowlist, missing allowlist table (query error), malformed allowlist (query error), client-supplied spoofed user ID (proved the allowlist check only ever uses the JWT-derived id, never a request-body field), zero calls into the reservation/model-call path on every denial branch, and a two-part proof that the production handler is genuinely shared: a static-source check that the canary file imports `handleKeywordScanRequest` and never itself calls `reserve_keyword_scan`/`complete_keyword_scan`, plus a **live call-through** — an allowlisted request with no `OPENAI_API_KEY` configured returns exactly `{"error":"Scan service is not configured"}`, a string that only exists inside `keyword-scan.ts`'s own source, proving real delegation happened rather than a stub.

## Item 7 — Terms of Service neutral clause

[TermsPage.diff.md](frontend/TermsPage.diff.md) updated: the flagged sentence characterizing a specific EU 14-day statutory withdrawal right is replaced with exactly *"Nothing in these Terms or our refund policy affects any statutory rights you may have."* No characterization, no jurisdiction claim — a pure non-waiver. Still review-only candidate copy, not applied to the live `TermsPage.tsx`.

## Item 8 — evidence-accuracy discipline, applied throughout this turn

Every result above is genuinely executed, not inferred:
- **Syntax/formatting-passed:** `deno fmt` then `deno fmt --check` — exit 0, `Checked 16 files`.
- **Type-checking-passed:** `deno check` on all 13 `.ts` files individually — 13/13 exit 0, under `strict: true`.
- **Unit-tests-passed:** 32/32 across three suites (`extract-job-url.test.ts` 9, `price-config.test.ts` 13, `keyword-scan-canary.test.ts` 10), real `deno test` execution with the exact permission flags required (`--allow-env` for env manipulation in tests, `--allow-read` for the static-source check) — documented, not glossed over.
- **Database-migration-executed:** N/A this turn — no SQL files changed since Item 2/the precondition correction, which were already verified by real execution.
- **Production-compatibility inferred but not proven:** the `pg_net` check and pg_cron idempotency citation are real evidence about the target environment, but no code was actually run against it — that remains a genuine gap versus real deployment, stated plainly, not implied to be closed.

## Item 9 — this report; remaining external blocker; cloud-modification confirmation

**Remaining external blocker, unchanged:** real Stripe test-mode Price IDs. I have no Stripe Dashboard access and cannot invent them — see `STRIPE_TEST_SETUP.md`.

**One-time transparency note from this session, not a task item:** while investigating a Stripe apiVersion question, I checked (read-only) what's actually deployed to production and found the live `keyword-scan`, `stripe-webhook`, and `request-refund` Edge Functions run older code than both the review candidates *and* the current git-committed `supabase/functions/` source — production is still on the pre-pack-system subscription model. Nothing was changed as a result; flagged for your awareness, separate from the V4.1 review itself.

**Cloud-modification confirmation:** every Supabase MCP call made this session was read-only (`list_projects`, `list_edge_functions`, `get_edge_function`, `list_extensions`). No `apply_migration`, `deploy_edge_function`, or any write call was made to either project. All SQL execution happened against local disposable Postgres databases (confirmed via empty `inet_server_addr()` in earlier items). Git: no commits or pushes made. All 7 modified/created files this turn are under `review/part_a_v3/` only — confirmed via `git status`, zero changes to `supabase/migrations/` or `supabase/functions/`.

**Status: all 9 V4.1 items complete.** Waiting for your review before any cloud application.
