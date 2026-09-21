Date
2026-09-21

Incorrect assumption or mistake
That a protection trigger written as `if auth.role() is distinct from
'service_role' then <revert the protected columns>` only stops clients. It also
stops pg_cron. `sweep_stale_processing_checks()` set crashed checks to 'failed'
every 5 minutes, and `protect_check_analysis_fields` silently put them back to
'processing' while `set_updated_at` refreshed `updated_at`. A check whose
analysis crashed stayed 'processing' for good, and its owner was blocked from
starting a new check most of the time. Nothing errored; the job "succeeded".

The same mistake had already been found and fixed on `profiles` in
`20260828064337_fix_expire_credit_batches_trigger_block.sql`, but the fix was
not applied to the sibling trigger on `checks`.

Why it was wrong
pg_cron runs its commands as `postgres` with no `request.jwt.claims`, so
`auth.role()` is NULL, which IS DISTINCT FROM 'service_role'. A trigger cannot
tell a maintenance job from a client unless it checks for the maintenance
session explicitly.

Verified correct rule
A trigger that reverts or rejects writes by role must also let the internal
maintenance session through, identified exactly as 20260828064337 does:
`current_user = 'postgres' and session_user = 'postgres' and
current_setting('request.jwt.claims', true) is null`. That migration also
records the production role graph check to run before relying on it.

How to prevent recurrence
When writing or changing a protection trigger, list every writer of the table,
including SECURITY DEFINER functions run by cron, and test the cron path from
a session with no JWT claims. `scripts/local-db/replay.sh` rebuilds the schema
locally without Docker; run the job's function there from a fresh psql session
and read the row back. To find every trigger gated on `auth.role()` and whether
it has the exemption, query `pg_proc` for trigger functions whose definition
matches `auth\.role\(\)`. As of this date: `protect_profile_billing_fields`
and `protect_check_analysis_fields` are exempt; `protect_profile_acquisition_fields`
is not, and has no scheduled writer, so it is not affected.

Affected files or systems
`supabase/migrations/20260811130000_lock_down_check_analysis_writes.sql`
(original trigger), `20260921120000_lock_down_check_rows_and_testimonials.sql`
(fix), `sweep_stale_processing_checks()`, pg_cron job
`sweep-stale-processing-checks`.

Source used for verification
Local replay of every migration (Postgres 16, Supabase roles stubbed): on the
origin/main migrations the sweep left a check 'processing' with `updated_at`
reset to now; with the fix it set 'failed' and the retry message. Production
was not queried.
