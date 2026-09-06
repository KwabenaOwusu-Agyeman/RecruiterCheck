Date
2026-09-06

Incorrect assumption or mistake
That the Edge Function workflow deploying "functions changed in this push"
meant every merged change reaches production. It does not when a run fails.

Why it was wrong
The workflow diffed against `github.event.before`, the previous commit on main.
If a run failed during validation and the next commit touched different
directories, the functions from the failed run were never selected again. Main
carried the new code, production kept the old, and no run was red to show it.
It happened to `brevo-stats`: its fix was in a run that failed on a test, the
follow-up commit only touched a `stripe-webhook` test file, so only
`stripe-webhook` redeployed. The function stayed on version 1 with a broken auth
gate. The only signal was its version number not moving.

Verified correct rule
The diff base is the head commit of the workflow's last SUCCESSFUL run, looked
up through the Actions API, so a failed run's changes are included in the next
one. Every way of resolving that base can fail, and all of them widen to
deploying every function rather than narrowing: a redeploy of an unchanged
function is a slow no-op, while skipping one that needed to go out is invisible.

How to prevent recurrence
After any merge that touches `supabase/functions/**`, confirm the run's log
actually contains a `Deploying <function>` line for the function you expect. A
green run can mean "deployed nothing", because the deploy job is skipped when
the selection is empty.

Do not use the version number from `supabase functions list` as that check. It
is a weaker signal than it looks: Supabase does not bump the version when the
deployed bundle is unchanged, so a genuine redeploy can leave the version and
UPDATED_AT untouched. Observed on 2026-09-06, when a run that logged
`Deploying brevo-stats` left it on version 2. The version moving proves a
deploy happened; it not moving proves nothing either way. When a run fails before
deploying and the fix does not touch every affected directory, use the manual
`workflow_dispatch` full redeploy, which CLAUDE.md already documents.

Affected files or systems
`.github/workflows/deploy-edge-functions.yml`, guarded by three tests in
`supabase/functions/brevo-stats/logic.test.ts`.

Source used for verification
Replayed against the real history of the incident: from the previous commit
(`0be72fd`) the selection is `stripe-webhook`, which is the bug; from the last
successful run (`80633cf`) it is every function, which is correct. The guard was
checked by injecting a revert and confirming it fails.
