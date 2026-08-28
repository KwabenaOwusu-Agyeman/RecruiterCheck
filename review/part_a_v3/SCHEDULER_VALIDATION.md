# V4.1 Item 5 — scheduler migration structural validation

**Not applied. Read-only checks only, against `myrecruitercheck-scoring-test` (`zmltzqbiizrebkrjdcge`).**

## pg_net status (read-only, not enabled)

`list_extensions` against the test project: `pg_net` — `installed_version: null` (available default `0.20.4`, not installed). `pg_cron` — `installed_version: "1.6.4"` (already enabled).

Consequence: `04_scheduler_migration.sql`'s own precondition (lines 11–16, `raise exception` if `pg_extension` has no `pg_net` row) would fire correctly if applied today — verified against real current state, not assumed.

## Fail loudly on missing extension/secrets

- Extension: yes, explicit check at the top of the file, `raise exception` before anything else runs.
- Secrets (`app_secrets.reconcile_ambiguous_refunds_url` / `cron_invoke_secret`): checked, but *not* at migration-apply time — checked inside `invoke_reconcile_ambiguous_refunds()` at *invocation* time (`raise exception` if either is null). This is correct by design, not a gap: the file's own trailing comment block requires those values to be inserted **after** the migration runs (a manual step, since they're real secrets that must never be committed as literals in the migration file). A migration-time check would be structurally impossible — the rows don't exist until the post-migration manual step. The runtime check inside the function is the right place, and it does fail loudly rather than silently sending a malformed request.

## Duplicate cron jobs on rerun

Verified against real pg_cron documentation (not assumed): `cron.schedule(job_name, schedule, command)` is an **upsert** keyed by `job_name`, idempotent since pg_cron 1.3 — [Citus: Evolving pg_cron together](https://www.citusdata.com/blog/2020/10/31/evolving-pg-cron-together/), corroborated by [Microsoft Community Hub](https://techcommunity.microsoft.com/blog/adforpostgresql/evolving-pg-cron-together-postgres-13-audit-log-background-workers--job-names/1829588). The test project runs pg_cron 1.6.4, well above that threshold. The migration's own trailing duplicate-jobname check (lines 60–65) is real defense-in-depth on top of this, not the only protection.

## Bounded HTTP invocation timeout

Yes — `timeout_milliseconds := 30000` on the `net.http_post` call (line 47).

## No plaintext credentials in migration history or `cron.job`

Confirmed by inspection: the scheduled command string is `select public.invoke_reconcile_ambiguous_refunds()` — no secret is ever embedded in the `cron.schedule()` call or the resulting `cron.job.command` value. The actual secret is read from `app_secrets` (a table with zero grants to any role, accessed only inside the `SECURITY DEFINER` function) at invocation time, and is used only as an outbound HTTP header — never written to any table pg_cron itself logs.

## Reconciliation endpoint is service-role-only (i.e., cron-secret-gated)

**Found and fixed a real bug during this check:** `reconcile-ambiguous-refunds.ts`'s original auth check (`if (cronSecret && header !== cronSecret) return 401`) was **fail-open** — if `CRON_INVOKE_SECRET` was ever unset, the check short-circuited to `false` and skipped authentication entirely, making this refund-mutating endpoint publicly callable by anyone with the URL. Fixed: a missing `CRON_INVOKE_SECRET` now returns `503` before any other logic runs, matching the fail-closed pattern used everywhere else in this package.

## A failed HTTP invocation never marks a refund failed or restores credits

Two failure modes, both verified:
1. **pg_net → edge function invocation itself fails** (network error, DNS failure, timeout before the function is reached): the edge function's code never executes at all in this case — by construction, nothing inside it (including `fail_refund`/`finalize_refund`) can run. No separate guard is needed; this is structurally guaranteed.
2. **Edge function reaches Stripe but the lookup fails** (`stripe.refunds.list` throws): caught explicitly (lines 84–91 in the fixed file) and only increments `stillAmbiguous` — `fail_refund` is called **only** when Stripe returns a definitive `allFailed` result (every refund attempt on that payment intent shows `status: 'failed'` or `'canceled'`), never on an ambiguous/network-error path.

## Not done (explicitly out of scope, per your instruction)

The migration itself was **not applied** to any project, and `pg_net` was **not enabled**. This is purely a structural/documentation validation plus one real code fix in the accompanying edge function.
