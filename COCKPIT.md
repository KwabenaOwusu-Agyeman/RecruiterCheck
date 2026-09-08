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

- **Founder action.** Verify a real Google sign-in end to end after the move
  to the `myrecruitercheck` Cloud project, then delete the old `RecruiterCheck`
  OAuth client in `theorycoach-ai`. Recorded 2026-09-07.
- **Founder action.** Review the first newsletter issue in Brevo before it sends
  at 09:00 Europe/Amsterdam. The model leg has never been exercised, so this is
  the first generated copy anyone will have read. Recorded 2026-09-07.
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

## 2026-09-08 — Pricing schema, sitemap lastmod, SEO cross-links

**Objective.** Close the two gaps an SEO and AI search visibility audit left
open: the pricing page carried no offer structured data, and `public/sitemap.xml`
carried no `lastmod`. Plus link the role checker and comparison pages to their
siblings.

**Completed.** `src/pages/PricingPage.tsx` now emits `Product`/`Offer` and
`BreadcrumbList` JSON-LD, mapped from `CHECK_PACKS` so prices and entitlements
cannot drift from the cards. `scripts/prerender.mjs` reconciled the two new CSP
hashes itself; the `vercel.json` and `scripts/csp-managed-hashes.json` diffs are
its output. All 32 `public/sitemap.xml` URLs gained a git derived `<lastmod>`.
The five role checker pages and six comparison pages cross link their siblings
through the existing `relatedLinks` prop on `SeoLandingPage`.

**Verified.** `npm run checks` selected lint, typecheck, `test:unit`, `npm run
build` and a sitemap and metadata check. Lint clean bar two pre existing
`react-refresh` warnings in `AuthModalContext.tsx` and `useAuth.tsx`; typecheck
clean; 14/14 unit test files, 181 assertions; build and prerender succeeded. All
153 `application/ld+json` blocks in `dist/` parse. Both clusters confirmed
complete in the prerendered HTML: each role page reaches its 4 siblings, each
comparison page its 5, no duplicates and no self links. All 32 sitemap URLs
prerender with a matching canonical, title and description, and no `lastmod` is
future dated.

**Blockers.** None.

**Founder action required.** Two MANUAL CHECK REQUIRED items the repo has no
tooling for: validate the new pricing JSON-LD in an external structured data
validator, and a browser and console pass against `localhost:5173`. Also decide
whether the `Offer` description should keep its repeated check count, described
below.

**Next technical step.** Each `Offer` description renders as "5 Recruiter
Checks. 5 Recruiter Checks, Interview Score, ..." because `features[0]` in
`CHECK_PACKS` already states the count that the template prefixes. It is
correct but reads twice. Implemented as specified rather than silently
altered; a one line change to the template in `PricingPage.tsx` drops the
stutter if wanted.

**Commit or PR.** Branch `seo-schema-and-cross-links`, commit `a972215`.

---

## 2026-09-08 — Payments reconciles against Stripe, Control Centre config documented

**Objective.** Close the STRIPE_SECRET_KEY open item and write down what it
depended on, since the Control Centre's configuration was documented nowhere.

**Completed.** The founder created a Stripe restricted key and set it on the
`myrecruitercheck-admin` Vercel project, Production scope, then redeployed.
`admin/.env.example` added, names only. `CLAUDE.md` corrected on how the Control
Centre deploys.

**Verified.** The Payments page no longer shows "Not reconciled against Stripe"
and its single purchase row reads **Matches Stripe**. That row is a refunded
purchase, so `reconcileRefund` and the payment intent retrieve were both
exercised, which covers every Stripe call `admin/src/server/stripe.ts` makes.

Three things worth keeping. The key is a restricted read only key, and in the
Dashboard's grid that is TWO rows rather than the three API resources the code
implies: **Payment Intents** (Read) and **Charges and Refunds** (Read), Stripe
grouping the latter two. The charge half is needed only for the
`expand: ['latest_charge']` and is easy to omit, in which case the expand fails
while everything else appears to work.

Second, this was set on the wrong Vercel project first. There are two, and
`STRIPE_SECRET_KEY` had been live in Supabase secrets for the Edge Functions
while unset for the Control Centre since 2026-09-06 for exactly this reason.

Third, `CLAUDE.md` claimed a merge deploys the SPA and the Control Centre
"through two independent Vercel builds". It does not: that Vercel project is not
connected to GitHub, so merging deploys only the SPA and any changed Edge
Functions. Verified in the project overview, which offers Connect Git, has
"Connect Git Repository" unticked on the production checklist, and shows
`vercel deploy` as every deployment's Source. Its production deployment was 22
hours old and marked Stale.

**Blockers.** None.

**Founder action required.** None for this. Note that the Control Centre now
needs a manual `cd admin && vercel --prod` whenever an `admin/` change should go
live; merging does not do it.

**Next technical step.** None outstanding.

**Commit or PR.** PR #66 on `admin-env-example`.

## 2026-09-08 — Newsletter postings cover five regions

**Objective.** Make the weekly issue's five postings cover EU, UK, USA, Africa
and India, one role each.

**Completed.** `supabase/functions/publish-weekly-newsletter/boards.ts` holds 47
company boards on Greenhouse, Lever and Ashby, grouped into the five regions,
plus `regionFor`, `isUnplaceable` and `resolveRegion`. `logic.ts` gains
`parseBoard`, which routes board postings through the existing `toItem` so they
get the same dash removal and apprenticeship filter as feed postings, and
`selectPostings` now takes one role per region before filling the rest from
anywhere. `index.ts` fetches the boards in batches of six with an eight second
per board timeout. `dry-run.ts` loads them too, so the local preview and the
weekly job read the same sources. Tests in `boards.test.ts`, offline by design.

**Verified.** `npm run checks` selected lint, typecheck and `test:edge`. Lint 0
errors (5 pre-existing react-refresh warnings in `src/`), typecheck clean,
`test:edge` 24/24 files and 400 assertions, `boards.test.ts` 14 passed. Dry run
against the live boards: 5704 postings from 47 boards, all five regions covered,
191 words.

The measurement that justified the work: on 2026-09-08 the two open feeds
carried 267 postings between them, split EU 117, UK 64, USA 3, Africa 0,
India 0. Africa and India were unreachable from Remotive and Arbeitnow, so no
amount of gathering would have filled those slots.

Three defects found and fixed while building it. Region taken from the source
list rather than the posting filed a Moniepoint role in Poland under Africa and
an OpenAI role in Tokyo under USA; region now comes from the posting's location,
and a location outside the five is dropped rather than mislabelled. Region had
to be read from the raw location, because `normaliseText` truncates to 40
characters and a Californian posting loses its country to that cap. And a dry
run selected "Senior AI Governance Counsel" for the week's five, a legal role
ranked top because `' ai '` is a strong term, so `tier()` now excludes the
functions around the technology rather than in it.

**Blockers.** None.

**Founder action required.** PR #64 is not merged. Merging deploys
`publish-weekly-newsletter`, which sends a live scheduled campaign to real
subscribers, so the deploy is a decision rather than a formality.

**Next technical step.** Nothing outstanding. A slug that stops resolving costs
its own board and is visible in the function logs as `board non-ok`; the board
list is the thing to revisit if a region starts coming up empty.

**Commit or PR.** `8d79676`, `0d2a88e` and `ecf749e` on
`newsletter-regional-sources`, PR #64. Not merged, not deployed.



## 2026-09-07 — Newsletter schema applied, automation live

**Objective.** Apply the three migrations and confirm the weekly job can run.

**Completed.** The founder ran `supabase db push`. All three applied:
`20260907190000_newsletter_issues.sql`,
`20260907190100_publish_weekly_newsletter_cron.sql` and
`20260907200000_publish_weekly_newsletter_first_run.sql`. The newsletter is now
live end to end: table, weekly cron job, and the one-off catch-up poller.

**Verified.** `supabase migration list --linked` shows all three with matching
local and remote versions, so nothing is orphaned. `supabase gen types
typescript` against the live schema produces a file **byte identical** to the
committed `src/types/database.ts`, and `admin/src/types/database.ts` matches it,
so the hand written `newsletter_issues` entry was exactly right and there is no
drift to correct. No commit was needed.

The dry run was executed against the live feeds without a key: 17 roles from
Remotive and 234 from Arbeitnow, five selected. Normalisation confirmed working
on real data, `Lead Data Engineer, Data Platform & AI` rendering with a comma
rather than the dash the source carries, no gender boilerplate, and no
Werkstudent listings surviving. The model leg remains unexercised locally.

**Blockers.** None technical.

**Founder action required.** Review the first issue in Brevo before it sends at
09:00 Europe/Amsterdam.

**Accepted risk.** An OpenAI API key and a Supabase webhook secret were visible
in a screenshot during this session. Rotation was proposed twice and declined by
the founder on 2026-09-07. Recorded here as a decision rather than an open item,
because it is not outstanding work. The exposure means the OpenAI key could be
used to spend against the account and the webhook secret could be used to forge
unsubscribe events. A spend cap on the OpenAI key bounds the first of those
without rotating. No key value appears in this repository.

**Next technical step.** Confirm the catch up poller ran once and removed
itself, and that `newsletter_issues` holds one row with a `campaign_id`. Until
that row exists the Control Centre correctly shows a Newsletter warning reading
"No newsletter issue has ever been built"; it clears itself on the first run.

**Commit or PR.** No code change. Schema applied from `main` at `f653582`.

## 2026-09-07 — Issue sweep over the newsletter automation

**Objective.** Fix everything outstanding that does not require the founder.

**Completed.** Five PRs, #56 through #59 plus the alert.

Two ordering bugs in `publish-weekly-newsletter/index.ts`, both found by
reviewing already merged code (#57). A **double send** was possible: the order
was create the campaign then record it, so a failed write left nothing
recording the week as done and the next invocation sent a second campaign to
the whole list. With the first run poller firing every ten minutes that was a
loop, not an edge case. The week is now reserved before Brevo is called. And
`fail()` ran before the existing-issue check, so a missing key could overwrite a
scheduled row and lose its `campaign_id` while the email sent anyway; the check
now runs first.

`index.test.ts` guards both orderings at source level, `index.ts` being
unimportable under tsx. The guards were checked against a deliberately reordered
copy to confirm they fail when the order is wrong.

The first run poller now stops after any row exists rather than any scheduled
row, so a failed week is attempted once rather than retried every ten minutes
against two feeds and a paid API (#57). `loadAlerts` gained a critical alert for
a reservation whose `campaign_id` never came back, which is the one state the
reserve-first ordering introduces and nothing was watching (#58). Both cron
timeouts raised from 120s to 180s, the worst case run being 125s (#59).

Stale references from before automation cleared (#56): `CREDITS.md` described a
blog and pointed at a deleted `scripts/newsletter/cover.ts`; `week37.json` read
as a pending manual issue and is now `example-issue.json`; `GEMINI_API_KEY` was
documented in `.env.example` and referenced by no code anywhere.

**Verified.** Full suite 37/37 files and 567 assertions. lint 0 errors,
typecheck clean in both apps, `npm run build` clean with all 52 CSP hashes
unchanged, admin build clean. Deploy runs 34150865305 and the run for #59 both
succeeded, deploying `publish-weekly-newsletter` alone, correctly, since
`_shared/` did not change.

A repo wide dangling reference sweep found nothing real: every apparent miss is
either a path relative to `recruitercheck-extension/`, a reference inside the
`PART_A_*` and `review/` material that `CLAUDE.md` records as unmaintained
history, or a `COCKPIT.md` entry describing what was true when written.

**Blockers.** All three migrations still unapplied. `supabase db push` remains
refused by this environment's command classifier.

**Founder action required.** Unchanged: run `supabase db push`, having run the
dry run with a key first.

**Next technical step.** The five `react-refresh` lint warnings are the only
known unfixed defect. Two are in `src/hooks/useAuth.tsx` and
`src/features/auth/context/AuthModalContext.tsx`, so fixing them means editing
auth code, which is a mandatory security review, to silence a cosmetic warning
in files unrelated to any current work. Left deliberately.

**Commit or PR.** PRs #56, #57, #58, #59 on `main`.

## 2026-09-07 — First newsletter issue brought forward to tomorrow

**Objective.** Not wait until Monday 14 September for the first issue.

**Completed.** `supabase/migrations/20260907200000_publish_weekly_newsletter_first_run.sql`
schedules `publish-weekly-newsletter-first-run`, a poller that runs every ten
minutes, invokes the function once with `{"firstRun": true}`, and unschedules
itself once an issue exists or after 15 September. It polls rather than firing
at a fixed time because `supabase db push` is run by hand: the first tick after
the schema lands does the work, whenever that is.

`nextNineAm(now, minLeadHours)` in `logic.ts` gives the next 09:00
Europe/Amsterdam at least three hours away; `FIRST_RUN_MIN_LEAD_HOURS = 3` in
`index.ts`. Below the threshold it rolls to the following morning rather than
scheduling into a window too short to react in, and Brevo rejects a past
`scheduledAt`, so there is no path from here to an immediate unattended send.
The weekly Sunday to Monday cadence is unchanged: this schedules one issue, not
a second series.

**Verified.** lint 0 errors, typecheck clean, `test:edge` 22/22 files and 381
assertions, `logic.test.ts` 36 including the first run taking tomorrow rather
than next Monday, refusing to schedule inside the notice window, and holding
that window across the October clock change. PR #54 merged as `6d3fc23`, deploy
run 34149831177 succeeded and deployed `publish-weekly-newsletter` alone, which
is correct: `_shared/` did not change this time.

**Blockers.** All three migrations are still unapplied; `supabase db push`
remains refused by this environment's command classifier. Nothing runs until
the founder applies them.

**Founder action required.** Run `supabase db push`. The first issue then
schedules within about ten minutes for 09:00 Amsterdam, tomorrow if pushed
before roughly 06:00. Push after 15 September and the catch-up job removes
itself on its first tick and the normal Sunday cadence takes over.

**Next technical step.** After the push, confirm a `newsletter_issues` row with
status `scheduled`, then check `cron.job` no longer lists
`publish-weekly-newsletter-first-run`. Regenerate both `database.ts` files.

**Commit or PR.** `6d3fc23` on `main`, PR #54. Deploy run 34149831177.

## 2026-09-07 — Newsletter automation merged and deployed, migrations blocked

**Objective.** Ship the automatic newsletter: merge, deploy, apply the schema.

**Completed.** PR #52 merged as `8369065`. The Edge Function deploy run
(34148830631) succeeded and deployed all 27 functions, `_shared/newsletter/`
having changed, `publish-weekly-newsletter` among them. The frontend went out
from the same merge through Vercel, which published `public/newsletter/`.

**Verified.** The deploy run log carries a `Deploying <fn>` line for all 27
functions, which is the check that matters rather than a version number.
`https://myrecruitercheck.com/newsletter/reviewing-an-application.jpg` returns
200 with `image/jpeg`, so newsletter images no longer 404 in an inbox.
An unauthenticated POST to the function returns 401
`UNAUTHORIZED_NO_AUTH_HEADER`, which is the Supabase gateway rather than the
function's own check, confirming that omitting a `config.toml` entry does give
`verify_jwt = true`. That was the one assumption in the design inferred rather
than confirmed.

`supabase migration list --linked` before the attempted push showed local and
remote identical for every prior migration, with only the two new ones pending.
No drift and no orphaned versions, unlike 2026-08-31.

**Blockers.** `supabase db push` was refused by this environment's command
classifier, so the two migrations are still unapplied. Until they are,
`newsletter_issues` does not exist and the `publish-weekly-newsletter` cron job
is not scheduled, so the function is deployed but nothing invokes it and no
newsletter can be produced. The Control Centre will show a Newsletter warning
reading "This check could not run" until the table exists; that is the alert
behaving correctly, not a fault.

**Founder action required.** Run `supabase db push` from the repo root to apply
`20260907190000_newsletter_issues.sql` and
`20260907190100_publish_weekly_newsletter_cron.sql`, then regenerate types.
Do the dry run first, since the schedule goes live the moment the cron
migration lands and the next firing is Sunday 13 September 08:00 UTC.

**Next technical step.** After the push, regenerate `src/types/database.ts` and
`admin/src/types/database.ts` and confirm the hand written `newsletter_issues`
entry matches what the generator produces.

**Commit or PR.** `8369065` on `main`, PR #52. Deploy run 34148830631.

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
