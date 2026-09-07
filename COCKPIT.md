# Cockpit

Current technical status of the MyRecruiterCheck application, the Supabase
backend and the Control Centre. Newest entry first.

This is a status record, not a transcript. It records what is true of the code
and its verification, and nothing about company strategy, marketing, business
metrics, customers or content planning. Those live in Notion HQ. See "Working
memory" in `CLAUDE.md`.

It records what was true when it was written. Before asserting a current fact,
go back to the primary source.

No secrets, tokens, CV contents, applications, email addresses, payment records
or production data appear in this file. Use anonymised identifiers where
operational context is needed.

## Open items

Technical work that is blocked, unfinished, or waiting on the founder. Kept
current in place rather than appended: delete a line when it is done. Strictly
technical and founder-blocking; everything else goes in a dated entry or in
Notion. If this list keeps growing, Claude is handing work back instead of
doing it.

- **Founder action.** `STRIPE_SECRET_KEY` is unset, so the Admin Dashboard
  Payments page shows "Not reconciled against Stripe". Recorded 2026-09-06.
- **Known limit.** Acquisition data begins 2026-09-05. Accounts created before
  that date cannot be attributed. Recorded 2026-09-06.

## Historical review material

`PART_A_KEYWORD_SCAN_REVIEW.md`, `PART_A_KEYWORD_SCAN_CORRECTED_REVIEW.md`,
`PART_A_KEYWORD_SCAN_CORRECTED_REVIEW_V2.md` at the repository root, and the
`review/` directory, are historical review and validation material from earlier
workstreams. They are kept as a record and are not maintained. They are not the
current status record. This file is.

Read them with one correction in mind. Each states in bold near the top that
nothing in it has been applied, deployed, committed or pushed. That was true
when each was written and is false now: the Part A keyword scan work shipped.
It is carried by
`supabase/migrations/20260828064817_part_a_keyword_scan_credits_and_refund_integrity.sql`
and the live `supabase/functions/keyword-scan/`. Treat every "nothing applied"
statement in those files as describing the moment of writing, not the present.
For current behaviour go to the migration, the function and the database.

---

## 2026-09-06 — `git push` now reaches both remotes

**Objective.** Make the Git section's "when main is pushed it goes to both"
true. It was not.

**Completed.**
- `origin` now carries two push URLs, `fullcircleAI/RecruiterCheck` and
  `KwabenaOwusu-Agyeman/RecruiterCheck`, set with
  `git remote set-url --add --push`. A single `git push` reaches both.
- Both remotes brought level at `abdbc82`.

**Verified.** `git push` printed two `To ...` blocks. The second remote
fast-forwarded `b9dfba3..abdbc82`, three commits, with no rejection, so the
two repositories were behind rather than diverged.

**What was wrong before.** `origin` and `personal` were separate remotes with
one push URL each, so a plain `git push` only ever reached
`fullcircleAI/RecruiterCheck`. `personal` had been silently falling behind, and
`CLAUDE.md` described a workflow the configuration did not implement. This is
invisible in the code: it cost a session's confusion when a container cloned
`KwabenaOwusu-Agyeman/RecruiterCheck` and correctly reported that committed
work was absent from it. If a push ever reaches only one remote again, check
`git remote -v` for two `(push)` lines on `origin` first. Adding a push URL
replaces the implicit default, so both must be listed explicitly.

**Blockers.** None.

**Founder action required.** None.

**Next technical step.** None. `personal` remains a second remote for fetching;
only the push path changed.

**Commit / PR.** Local Git configuration, not a commit. Recorded here because
nothing in the repository carries it.

---

## 2026-09-06 — Memory system audit, five documentation fixes

**Objective.** Audit the cockpit and memory system against its own goals, then
close the defects the audit found.

**Completed.**
- `CLAUDE.md` report format: `NOT PUSHED` and `NOT DEPLOYED` replaced by
  `PUSHED`, `MERGED` and `DEPLOYED`, which state what happened. The old footer
  contradicted the Git section, so a merge that deployed an Edge Function was
  reported as deploying nothing.
- `CLAUDE.md` Git section: staging named paths is now a rule, `git add -A` and
  `git add .` are forbidden by name, with the `06d16bf` incident cited.
- `CLAUDE.md` source of truth: links to Notion HQ, Product and Pricing (the
  approved current product specification), Product Roadmap and Decision Log.
  Levels 2 and 4 of the hierarchy were named but unreachable, so a session
  fell back to levels 5 and 6.
- `CLAUDE.md` working memory: the `COCKPIT.md` field list is now explicit, and
  moving founder-blocking items to Open items is a step.
- `COCKPIT.md`: Open items block added at the top; the historical pointer now
  records that the Part A keyword scan work shipped.

**Verified.** Documentation only. Diff was 58 insertions and 5 deletions across
two files, the five deletions being the reworded step lines and the two footer
lines. No application code, tooling, configuration or scoring logic changed.
`admin/**` matrix row confirmed against the `admin` rule in
`scripts/which-checks.mjs`; it documents existing behaviour.

**Blockers.** None.

**Founder action required.** None from this work. See Open items.

**Next technical step.** None outstanding. The audit's remaining observations
were deliberately not acted on: the historical `PART_A_*` files and `review/`
stay unmodified, and `README.md` still describes an older stack than
`CLAUDE.md`.

**Commit / PR.** `59d1ac2`, staged as named paths.

---

## 2026-09-06 — Marketing reporting, Brevo proxy, deploy base corrected

**Objective.** Add marketing reporting to the Admin Dashboard, and stop the
Edge Function workflow silently skipping functions after a failed run.

**Completed.**
- Acquisition attribution in the SPA: `src/lib/attribution.ts` (first touch in
  `localStorage`, UTM and referrer host only), `src/components/CaptureAttribution.tsx`,
  `src/services/attributionService.ts`. `trackEvent` now records `page_path`, so
  `landing_view` is per page rather than identical across all 23 SEO routes.
- Migration `20260905140000_acquisition_attribution.sql`: nullable columns on
  `analytics_events` and `profiles`, plus `protect_profile_acquisition_fields`
  making the acquisition columns write once. `handle_new_user` untouched.
- Admin routes `/acquisition`, `/content`, `/audience`, `/email` with
  `admin/src/server/metrics/marketing.ts`. `analytics_events` now has a reader.
- `supabase/functions/brevo-stats/`: read-only Brevo proxy so `BREVO_API_KEY`
  stays only in Supabase secrets. The admin app holds no Brevo credential.
  `verify_jwt = true` pinned in `config.toml` and recorded in the guard map in
  `stripe-webhook/index.test.ts`.
- `.github/workflows/deploy-edge-functions.yml` now diffs against the last
  successful run rather than `github.event.before`. See
  `memory/2026-09-06-deploy-base-was-previous-commit.md`.

**Verified.** `test:edge` 19/19 files, 314 assertions. `test:admin` 7/7, 96.
`test:unit` 12/12, 164. Build reports 52 CSP hashes unchanged. Deployed
`brevo-stats` returns real figures (22 delivered, 14 unique opens) and rejects
an absent header, the anon key and a forged `service_role` token with 401.

**Not done.** `STRIPE_SECRET_KEY` is still unset, so Payments shows
"Not reconciled against Stripe". Acquisition data begins 2026-09-05; earlier
accounts cannot be attributed.

**Correction made in this session.** Commit `06d16bf` also carried `CLAUDE.md`,
`COCKPIT.md` and `memory/README.md`, which were unrelated working tree changes
swept in by `git add -A`. Nothing sensitive, but the commit message does not
describe them.

---

## 2026-09-06 — Cockpit and memory system installed

**Objective.** Give Claude Code a small technical memory that survives between
sessions, without duplicating Notion HQ.

**Completed.**
- `CLAUDE.md`: added a source of truth hierarchy, an Admin Dashboard section
  covering purpose, responsibilities and boundaries, the operational Level 3
  actions, an `admin/**` row in the check matrix, and a Working memory section
  carrying the before/during/after protocol and the Notion boundary.
- `COCKPIT.md` created (this file).
- `memory/README.md` created. No records yet.

**Verified.**
- Documentation only. No application code, tooling, configuration or scoring
  logic changed.
- The `admin/**` check matrix row matches the `admin` rule already present in
  `scripts/which-checks.mjs`; it documents existing behaviour rather than adding
  any.
- Push and merge authority is unchanged from what `CLAUDE.md` already documented.

**Blockers.** None.

**Founder action required.** None outstanding.

**Next technical step.** At the end of the next piece of implementation work,
add an entry here using the fields above.

**Commit / PR.** `06d16bf`, which also carried unrelated marketing work. See
the correction in the entry above.
