Date
2026-09-22

Incorrect assumption or mistake
That a migration version later than the newest file on `main` is free to use.
`20260922090000_drop_unused_keyword_scan_reservation_functions.sql` (PR #128)
was given the same version as `20260922090000_snapshot_refund_amounts.sql`
(PR #126), which merged to `main` after #128's branch was cut. Production
recorded `20260922090000` for the refund migration. The founder then ran
`supabase db push` for #128, and afterwards the six functions and two cron
jobs it drops were all still live. The drop
was renamed to `20260922170000` and has to be pushed again.

Why it was wrong
Production records applied migrations by version, and `supabase db push`
decides what to run by comparing versions; the name after the underscore plays
no part. A local file whose version production has already recorded counts as
applied, so it is skipped rather than run. `main` is only
one of three places a version can already be taken: open PR branches and
production's own history are the other two, and either can move while a
branch is open.

Verified correct rule
A migration version must be unused on `main`, on every open PR branch and in
production's migration history, checked when the file is created and again
immediately before `db push`. After a push, confirm the version is recorded
under the expected name and that the schema actually changed. The CLI saying
the push succeeded does not show that this file ran.

How to prevent recurrence
Before choosing a version, and again before pushing:
- `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`, then list
  `supabase/migrations/` across `origin/*` and pick a version later than all
  of them.
- Read production's history with the Supabase MCP `list_migrations` (read
  only, metadata, no user data) and confirm the version is absent.
- After merging `main` into a migration branch, run
  `ls supabase/migrations | cut -d_ -f1 | sort | uniq -d`. Any output is a
  collision. That check alone would have caught this one.
After the push, run `list_migrations` again and check that the version appears
with this file's name. Then confirm the change itself in the schema, for
example with regenerated types.
Local verification needs no Docker: `scripts/local-db/replay.sh` rebuilds the
schema from every migration. It applies both of two colliding files, so it
will not catch a collision; the `uniq -d` check will.

Affected files or systems
`supabase/migrations/20260922090000_snapshot_refund_amounts.sql`,
`supabase/migrations/20260922170000_drop_unused_keyword_scan_reservation_functions.sql`
(previously `20260922090000_...`), PR #126, PR #128, production
`supabase_migrations.schema_migrations`.

Source used for verification
Supabase MCP `list_migrations` on the production project after the push:
`20260922090000` recorded as `snapshot_refund_amounts`, no drop migration.
Production types regenerated after the push (schema only, no user data) still
contained all six functions, including `reserve_keyword_scan` and
`reconcile_abandoned_keyword_scan_reservations`. A scan of every `origin/*`
branch on 2026-09-22 after the rename found no other shared version.
