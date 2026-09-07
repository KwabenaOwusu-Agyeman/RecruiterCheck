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
- **Founder action.** Verify a real Google sign-in end to end after the move
  to the `myrecruitercheck` Cloud project, then delete the old `RecruiterCheck`
  OAuth client in `theorycoach-ai`. Recorded 2026-09-07.
- **Founder action.** Run the newsletter dry run with a key and read the
  result before the weekly job is ever scheduled:
  `OPENAI_API_KEY=<key> npx tsx scripts/newsletter/dry-run.ts`. Nothing else
  exercises the model. Recorded 2026-09-07.
- **Founder action.** Approve `supabase db push` for
  `20260907190000_newsletter_issues.sql` and
  `20260907190100_publish_weekly_newsletter_cron.sql`, then regenerate both
  `database.ts` files. Until pushed, publish-weekly-newsletter cannot run.
  Recorded 2026-09-07.
- **Founder action.** Do not send the week 37 newsletter until a frontend
  deploy has published `public/newsletter/`. Until then every image in the
  email 404s. Merging PR #52 triggers that deploy. Recorded 2026-09-07.
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

## 2026-09-07 — The weekly newsletter builds and schedules itself

**Objective.** Remove the human from the weekly newsletter: source five roles,
write the copy, render the issue and schedule the send, unattended.

**Completed.** `supabase/functions/publish-weekly-newsletter/` (index plus a
pure `logic.ts`), invoked by the `publish-weekly-newsletter` pg_cron job every
Sunday 08:00 UTC via `pg_net` with the Vault `service_role_key`, the same
pattern as `purge-expired-uploads` and `instagram-refresh-token`. It reads two
public keyless feeds (remotive.com, arbeitnow.com), selects five AI and tech
roles no recent issue used, generates all copy in one `gpt-4o-mini` call, and
creates a Brevo campaign scheduled for 09:00 Europe/Amsterdam the next Monday.
`{"dryRun": true}` builds everything and creates nothing.

The renderer moved from `scripts/newsletter/` to
`supabase/functions/_shared/newsletter/`. `scripts/newsletter/build.ts` remains
as the manual paste route. New `scripts/newsletter/dry-run.ts` runs the whole
pipeline locally. Two migrations: `20260907190000_newsletter_issues.sql` and
`20260907190100_publish_weekly_newsletter_cron.sql`. `loadAlerts` in
`admin/src/server/metrics/alerts.ts` gained a Newsletter alert.

**Verified.** lint 0 errors (5 pre-existing react-refresh warnings in `src/`),
typecheck clean in both apps, `test:edge` 22/22 files and 378 assertions,
`test:admin` 9/9 and 113, `npm run build` clean with all 52 CSP hashes
unchanged, and the offline dry run assembling a valid 182 word issue. Live
feeds parsed correctly: 17 items from Remotive and 237 from Arbeitnow, five
clean roles selected.

Three findings worth keeping. Real job titles are full of dashes and
`validateIssue` enforces the no dash rule on `postings[i].role`, so without
`normaliseText` every week would have failed to render; this was invisible to
invented fixtures and only appeared against the live feeds. Feed titles reach
the model prompt and are attacker influenceable, so generated copy is refused
if it contains a link, which is the one payload that survives escaping and
validation. And the rejection angle is fixed in `REJECTION_ANGLES` rather than
chosen by the model, because section two is deliberately painful copy sent
unattended.

**Blockers.** The two migrations are unapplied, so the function cannot run.
They were not verified against a local stack: there is no Docker on this
machine, the same deviation recorded on 2026-09-05. The OpenAI leg of the
pipeline is unverified locally because it needs a key this session cannot read.

**Founder action required.** Run `OPENAI_API_KEY=<key> npx tsx
scripts/newsletter/dry-run.ts` and read the issue it writes to
`.scratch/newsletter-dry-run.html`. That is the only check that exercises the
model. Then approve `supabase db push` for the two migrations, after which
`src/types/database.ts` and `admin/src/types/database.ts` must be regenerated:
the `newsletter_issues` entry in both was hand written to match, not generated.

**Next technical step.** Merge PR #52 once the dry run reads acceptably. That
deploys every edge function, because `_shared/` changed.

**Commit or PR.** `b4d77a4` on `newsletter-three-section`, PR #52, which now
carries the whole newsletter branch rather than only the template work.

## 2026-09-07 — Newsletter template: five roles, one budget for the whole issue

**Objective.** Fix the weekly Brevo newsletter at three sections and make the
whole issue a one minute read.

**Completed.** `scripts/newsletter/issue.ts` renders the fixed format: up to
`MAX_POSTINGS` job postings, one rejection piece, hiring trends.
`scripts/newsletter/piece.ts` loads each prose section from markdown under
`content/newsletter/pieces/`, escaping before producing markup so raw HTML in a
piece is inert rather than sanitised. `scripts/newsletter/build.ts` assembles an
issue from a weekly JSON frame and writes pasteable HTML. Week 37 is committed
as `week37.json` and `week37.html`. Four images under `public/newsletter/` with
`CREDITS.md`; week 37 uses two of them.

**Verified.** `npm run checks` selected lint, typecheck, both newsletter tests
and the build. Lint 0 errors (5 pre-existing react-refresh warnings in `src/`),
typecheck clean, `issue.test.ts` 18 passed, `piece.test.ts` 13 passed, build
renders at 225 words. Full suite run because exported symbols changed: 35/35
files, 526 assertions.

Two findings worth keeping. Ten postings and a one minute read are not
compatible: a note per role came to 190 words against a 200 word budget, which
is why `MAX_POSTINGS` is 5. And a per section word target does not bound an
issue, because two sections can each pass one and still total three minutes, so
the budget is counted by `countIssueWords` over everything a reader reads and
`piece.ts` now reports its count without judging it. Its `warnings` channel was
removed rather than left unused.

`scripts/which-checks.mjs` had no rule for `scripts/newsletter/**`, so a change
to the renderer selected no test at all, and `content/newsletter/` matched the
SEO rule, selecting a build and a sitemap check for email copy nothing
prerenders. Both fixed in the same commit.

**Blockers.** None.

**Founder action required.** The email must not be sent before a frontend
deploy has published `public/newsletter/`, or every image 404s in the inbox.
Merging PR #52 triggers that deploy. Sending itself is manual in Brevo.

**Next technical step.** Fill the five `REPLACE ME` posting slots in
`week37.json` and rebuild. Section three has no weekly source: the four older
drafts were assessed against the format and deleted, since one duplicated the
week 37 rejection piece, two were general advice the rejection section exists to
withhold, and none contained an observation a trends section needs. They are
recoverable from `a962a1b` under `content/newsletter/` if that judgement was
wrong.

**Commit or PR.** `ac7d82a` on `newsletter-three-section`, PR #52. Not merged.


## 2026-09-07 — Google sign-in moved to its own Cloud project and published

**Objective.** Make the Google consent screen show MyRecruiterCheck instead of
the raw Supabase host.

**Completed.** The OAuth client behind Google sign-in turned out to live in the
unrelated `theorycoach-ai` Google Cloud project, whose consent branding was
named for that product and whose OAuth config was incomplete. Since branding is
per project and that project is shared, MyRecruiterCheck was given its own
Cloud project `myrecruitercheck`: Auth Platform configured (app name
MyRecruiterCheck, External, home page, `/privacy`, `/terms`, authorised domain
`myrecruitercheck.com`), a new web OAuth client created with JavaScript origins
for the live site and `localhost:5173` and the Supabase `/auth/v1/callback`
redirect URI, and publishing status pushed from Testing to In production. The
founder copied the new client ID and secret into the Supabase Google provider.
No repository file changed.

**Verified.** Console shows Publishing status "In production", branding saved,
and the client listed. Not yet verified by a real sign-in.

**Blockers.** None.

**Founder action required.** Confirm a real Google sign-in completes for an
account that has never used the app, then delete the now unused `RecruiterCheck`
client in the `theorycoach-ai` project. The consent screen currently shows
`fullcircle.ai@gmail.com` as the support email, since Google offers only the
account address or a Google Group; a support@ Group would replace it. No app
logo is set, which is deliberate, as uploading one starts Google verification.

**Next technical step.** None in this repository.

**Commit or PR.** None. Console configuration only.

---

## 2026-09-07 — Sign-in verified end to end, newsletter consent at signup

**Objective.** Get the Control Centre login actually working, and give the
newsletter a way to gain subscribers.

**Completed.** `4084088` (#49): an unticked newsletter consent checkbox on the
signup form in `src/features/auth/components/AuthModal.tsx`, calling the
existing `newsletter-subscribe` function with `consent_source: 'signup'`. The
function had been written and deployed with zero callers. `CONSENT_TEXT`
updated to describe what will actually be sent; existing subscribers keep the
wording they saw.

**Verified.** All three sign-in methods work against production: Google
(round trip completed to the Control Centre, signed in), magic link, and
password. `test:unit` 14/14 files 181 assertions, `test:edge` 19/19 314, 52
CSP hashes unchanged. Consent copy and checkbox confirmed present in the
deployed bundle.

**Root cause found.** Google sign-in and the emailed magic link were both
broken by one missing entry in Supabase Authentication > URL Configuration.
Diagnosed with `auth.admin.generateLink`, which returns the redirect Supabase
actually resolved: every admin URL was being substituted with `site_url`,
identically to a deliberately bogus control URL. Fixed by adding
`https://myrecruitercheck-admin.vercel.app/**`. The same probe now reports
both admin paths allowlisted and still substitutes the control.

**Correction.** An earlier reading of the Google authorize URL was taken as
proof the allowlist was in place. It was not: that URL only carries what the
app requested, and Supabase validates at the callback. `generateLink` is the
probe that settles it.

**Incident, self inflicted.** `myrecruitercheck.com` returned 403 "Vercel
Security Checkpoint" on every path for roughly ten minutes while
`www.myrecruitercheck.com` stayed 200. Caused by polling the apex every 15
seconds in a loop waiting for a bundle hash to change. It cleared on its own,
confirming an IP scoped bot challenge rather than a project setting.
Deployment protection was checked and is correct: SSO is
`all_except_custom_domains`, so it does not apply to the custom domain. Watch
the Vercel deployment status, not the live site, when waiting for a deploy.

**Blockers.** None.

**Founder action required.** `STRIPE_SECRET_KEY` is still unset for the admin
project, so Payments shows "Not reconciled against Stripe".

**Next technical step.** Newsletter template in Brevo; then the sign-in event
log, which blocks historical active users and retention cohorts.

---

## 2026-09-07 — Google sign-in and magic link on the Control Centre

**Objective.** Make the Control Centre login usable. `admin/src/app/actions.ts`
called `signInWithPassword` and nothing else, while the admin account has only a
Google identity, so the form could never have succeeded.

**Completed.** Merged in `bae32ad` (#47). Not deployed.
- `admin/src/lib/redirectTarget.ts`: the open-redirect rule extracted from
  `auth/confirm/route.ts` and shared with the new `auth/callback/route.ts`,
  hardened for backslash and percent-encoded variants. 11 tests.
- `admin/src/app/auth/callback/route.ts`: OAuth code exchange. Grants nothing;
  `requireAdmin()` still decides.
- `admin/src/app/actions.ts`: `signInWithGoogleAction` returns the provider URL
  and never redirects to it, because `form-action 'self'` in middleware
  constrains the redirects a form submission follows. `sendMagicLinkAction` sets
  `shouldCreateUser: false` and returns one constant for every outcome.
- `admin/src/lib/actionContract.test.ts`: source-level guards for both, verified
  non-vacuous by injecting the redirect.

**Verified.** `test:admin` 9/9 files, 113 assertions. Admin lint, typecheck and
build clean. Two of the new tests found real bugs in the change itself: the
control-character rule applied to a decoded target rejected `/users?q=a%20b`,
and a stray NUL byte made a test file binary to git.

**Not verified.** The Google round trip. No container runtime for a local
Supabase, `supabase/config.toml:44` disables Google locally, and this was not
deployed. Route logic, redirect constraint, compilation and rendering only.

**Blocked on dashboard configuration.** Both flows hand Supabase a return
address, and Supabase falls back to `site_url` for an unlisted one, which lands
the user on the public site. Needs `/auth/callback` and `/auth/confirm` on the
admin origin under Authentication > URL Configuration, and Google enabled under
Providers.

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
