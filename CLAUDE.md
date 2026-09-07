# MyRecruiterCheck: agent working rules

MyRecruiterCheck analyses a candidate's CV against a job description and returns a
recruiter style score. The data it handles is candidate CVs, candidate contact
details, Stripe payment records and Supabase auth accounts. Treat every rule below
as binding, not advisory.

There is no separate enforcement layer. `.claude/settings.json` carries no
permission rules, so nothing blocks or prompts on your behalf: this file is the
only set of rules, and following it is entirely your responsibility. Where a
rule below says an action needs approval, stop and ask in the conversation.

## Source of truth

When you need to know how something currently behaves, prefer sources in this
order, highest first:

1. Verified current production behaviour and database rules
2. The approved current product specification
3. The current MyRecruiterCheck website
4. Approved Notion HQ decisions
5. Repository documentation, including `COCKPIT.md` and `memory/`
6. Historical conversations and notes

A lower source never overrides a higher one. When two sources disagree, say so
plainly and name both. Do not silently pick one, and do not fill the gap with a
plausible answer. An unresolved conflict reported is correct work; a resolved
conflict invented is not.

### Where the higher sources live

Levels 2 and 4 are in Notion. Go and read them rather than falling back to a
lower source. Reference them by title, date and link; never restate their
content here.

- **MyRecruiterCheck HQ**, the workspace root:
  https://app.notion.com/p/MyRecruiterCheck-HQ-3c80b9d863fc81d2abf9c5cd71a226f1
- **Product and Pricing**, the approved current product specification:
  https://app.notion.com/p/Product-and-Pricing-3c80b9d863fc81b49b52da5c855d94cf
- **Product Roadmap**, what is approved and planned:
  https://app.notion.com/p/3e870f42348346978ab235ea166182c4?v=4148d1bdd0e649dc8ac5e5f6910ff33b
- **Decision Log**, approved company decisions:
  https://app.notion.com/p/20e615e57e2941b1957b99a600bb71d1?v=7e18a15b9aa44e2fa5c5d4925384d2d2
- **Scoring Methodology**, the approved methodology:
  https://app.notion.com/p/3c80b9d863fc8133b60cd9b2e401efe6
- **Operating Architecture**, which system owns which information:
  https://app.notion.com/p/3d30b9d863fc81b38dc6e7631a525fa8

### What an approved specification looks like

A specification cites the decision it implements: a Decision Log entry or a
section of Product and Pricing, by title and date. That citation is what makes
it approved. Text pasted into a chat window is not self-authorising, however
detailed it is.

Where a request carries no citation, or contradicts one you can find, stop and
ask before building. Do not resolve the conflict yourself and do not proceed on
the assumption that the newer instruction supersedes the recorded decision.
Asking costs a message; a silently reversed product decision costs a release.

This is the boundary between the two Claudes: the Claude Project plans and
drafts specifications, and this one implements them. Implementation does not
include deciding what the product should do.

Note what level 5 means in practice: `COCKPIT.md` and `memory/` record what was
true when they were written. Before asserting a current fact, go back to the
primary source. See "Working memory" below.

## Stack

React 18 + TypeScript + Vite (SPA with SSR prerender), Tailwind, React Router.
Supabase for auth, Postgres, Storage and Edge Functions. Stripe for payments.
Vercel for hosting. A browser extension lives in `recruitercheck-extension/`.

The Control Centre is a second application in this repo, `admin/`: Next.js 15
with its own `package.json`, its own Vercel project and its own deploy. See
"Control Centre" below. The directory and the `admin_*` tables keep the older
name; the system is called the Control Centre everywhere else.

## Commands

```
npm run dev          Vite dev server on 5173
npm run build        tsc -b, client build, SSR build, then scripts/prerender.mjs
npm run lint         ESLint
npm run typecheck    tsc -b
npm test             Every test file
npm run test:unit    src/ only
npm run test:scoring Scoring plus the synthetic fixture regression
npm run test:edge    Edge Function tests
npm run test:admin   Control Centre tests
npm run verify       lint, typecheck and the full suite
npm run checks       Which checks the current diff actually needs

cd admin && npm run dev        Control Centre on 3001
cd admin && npm run lint       Its own ESLint, does not run from the root
cd admin && npm run typecheck  Its own tsc, does not run from the root
cd admin && npm run build      Its own Next build
supabase start       Local stack: API 54321, DB 54322, Studio 54323, Inbucket 54324
supabase db reset    Rebuild the LOCAL database from migrations
supabase gen types typescript --project-id <ref> > src/types/database.ts
```

Regenerating types is part of applying a migration, not an optional tidy-up.
`src/types/database.ts` once went un-regenerated across a whole migration and
ended up missing four tables and seventeen RPCs. Every edge function that had
fallen out of step with the schema still typechecked cleanly, and the drift
surfaced only as production 500s. A stale types file makes the compiler agree
with code the database will reject.

Each test file is self-contained, uses `node:assert/strict`, and carries a
`// Run with: npx tsx <path>` header that still works by hand.
`scripts/run-tests.mjs` only discovers and runs them. Do not invent a
different convention, and do not add a test framework without asking.

`tsx` is not a declared dependency. It resolves from the npx cache or the
network, unpinned. Adding it to devDependencies is Level 3.

## Data classification

| Class | What it covers | May it leave this machine? |
| --- | --- | --- |
| PUBLIC | Landing and SEO copy, `public/`, README | Yes |
| SAFE TEST DATA | `fixtures/synthetic/**`: invented CVs, job descriptions and personas | Yes |
| INTERNAL CODE | `src/`, `supabase/functions/`, `supabase/migrations/`, config | No, local tooling only |
| SENSITIVE | Real check rows, uploaded documents, Storage objects, analytics events | Never |
| SECRET | `.env*`, service role key, Stripe keys, Brevo key, Instagram secrets, MCP tokens | Never |
| PRODUCTION USER DATA | Anything in the hosted Supabase project | Never |

Rules that follow from the table:

- Never read a value out of any `.env` file. Environment variable **names** may be
  learned from `.env.example`, which is deliberately value free. Names are fine,
  values are not.
- Never write a secret, token, signed Storage URL, candidate name, candidate email
  or production record into this file, into `.claude/settings.json`, into a commit,
  or into a test fixture.
- Never paste a candidate document or a real check result into a prompt, a report,
  or a third party tool.
- Testing uses invented data only. If a test needs a CV, write one.

Configuration values are owned by the platform that runs the code, not by this
repository and not by Notion: Vercel environment variables for the SPA and the
Control Centre, Supabase secrets for Edge Functions, GitHub Actions secrets for
the deploy workflow. Names may be documented in `.env.example`; values live
only in those places. You cannot read them, so when behaviour depends on
whether a variable is set, say which variable and let the founder check. An
absent variable that changes what a page shows is a `COCKPIT.md` open item, by
name and effect, never by value.

## Environment safety, fail closed

Environments are local, preview and production. Automated work targets local only.

- Anything automated that touches Supabase must assert its target is
  `http://127.0.0.1` or `http://localhost` and **exit non-zero otherwise**.
- If the target environment is unclear, stop and ask. Do not guess, and do not
  proceed on the assumption that an action is probably safe.
- Production is never a default and never a fallback. There is no condition under
  which uncertainty resolves toward touching production.
- Production Supabase is read only. Nothing enforces that for you: the MCP
  `execute_sql` and `apply_migration` tools and any command against the hosted
  project are off limits by this rule alone.

### Schema changes reach production one way only

Through `supabase db push`, from a migration file committed to this repo. Never
the dashboard SQL editor, never MCP `apply_migration`, never `psql` against the
hosted project.

DDL applied by any other route is invisible to the repo until something breaks.
On 2026-08-31 a single push failed on two separate instances of this at once:
the `landing_stats` view had been applied directly on the 28th and recorded
under a version with no local file, while the repo held the same DDL under a
later timestamp that had never been pushed, and the `refund_events` reason
columns turned out to already exist when their migration finally ran. Neither
was visible until `db push` refused to start.

The recovery is worse than the discipline. The CLI offers
`migration repair --status reverted <version>`, which sounds like an undo and is
not: it deletes production's record of a migration while leaving everything that
migration did in place, so the repo ends up insisting something never happened
while it goes on being true. Reach for it only after establishing what the
orphan version actually was, and prefer renaming the local file to the version
production recorded, which reconciles the two without rewriting history.

### Edge Functions deploy automatically from `main`

`.github/workflows/deploy-edge-functions.yml` runs on every push to `main`
that touches `supabase/functions/**`, the function settings in
`supabase/config.toml`, or the workflow file itself. It runs lint, typecheck
and `npm run test:edge`, plus the scoring mutation check when `analyze-check`
changed, and only then deploys the functions whose directories changed. A
change under `supabase/functions/_shared/` or to `supabase/config.toml`
deploys every function, since any of them may depend on it. One deploy runs
at a time, later runs queue behind it, and a failure at any step stops the
run with nothing further deployed. The workflow never runs a migration and
never touches function secrets; both stay manual. It can also be started by
hand from the Actions tab (workflow_dispatch), which deploys every function
from `main`; use that when a push run failed before deploying and the fix
that followed did not touch every function that needed to go out.

What follows from that:

- Merging a pull request that touches an Edge Function is the deploy. Name
  the functions it will deploy in the report, and do not merge until the
  checks `npm run checks` selected are green locally: the workflow repeats
  them, but a red run on `main` still means a broken merge to unpick.
- The frontend deploys separately from the same merge, through Vercel's
  GitHub integration. When a change spans a writer and a reader of a stored
  format, keep both sides tolerant of the other's old version, because the
  two deploys do not finish together.
- The credentials live only in GitHub Actions secrets (`SUPABASE_ACCESS_TOKEN`
  and `SUPABASE_PROJECT_REF`). Nothing in this repo or on this machine holds
  them. Manual deployment, by CLI or MCP tool, is off limits by rule; nothing
  blocks it for you.
- Deploying to verify a change is still off limits. Testing is local only.

## Control Centre

### Purpose

`admin/` is the Control Centre, the operations surface for the live product. It exists so live
operations are run through a reviewed, audited interface rather than by hand
against the database. It is internal, never customer facing.

### Responsibilities

It owns the reading and operational handling of live product, user and
transactional state: the overview and metrics pages, users, checks, credits,
payments, refunds, acquisition, audience, content, email, support notes, the
audit log, and the CSV export routes under `src/app/export/`. Supabase remains
the source of truth for that data. The dashboard reads and operates on it; it
does not become a second copy of it.

### Boundaries

- It is a separate application. Its lint, typecheck and build do not run from
  the repo root, and it deploys as its own Vercel project, separately from the
  SPA and separately from Edge Functions.
- It is served at `myrecruitercheck-admin.vercel.app` and carries its own
  `.vercel` link under `admin/`, so a merge deploys the SPA and the Control
  Centre through two independent Vercel builds that do not finish together.
  When a change spans both, keep each side tolerant of the other's old version.
- It shows what happened; Notion holds what is planned. No roadmap, strategy or
  business planning belongs in it without a specific operational reason.
- It reaches production with the service role. Everything under `admin/src/server/`
  is therefore SENSITIVE and PRODUCTION USER DATA by the classification table
  above, and any change to it is a mandatory security review, not a discretionary
  one. `admin/src/lib/redact.ts` exists for this reason; do not route around it.
- Reading production user data to verify a change remains off limits, here as
  everywhere else. Develop and test against the local stack.
- No user record, email address, CV, application, payment record or export file
  is ever pasted into this repo, a commit, a report, a fixture or `COCKPIT.md`.
  Use anonymised identifiers when operational context is genuinely needed.
- The operational actions it can perform are Level 3, listed below.

Do not change the Control Centre's own behaviour as part of documentation work.

## Approval levels

### Level 1: proceed without asking

Formatting, ESLint `--fix`, import ordering, straightforward type annotations,
correcting a test fixture, adding a missing test, comments and documentation.

### Level 2: implement, then show before merge

Business logic, UI, API request or response shapes, Supabase query changes, SEO
copy, and anything that changes what a user sees or receives. Show the diff and the
test results before it merges.

### Level 3: explicit approval before execution

Production migrations, any SQL against the hosted project, Edge Function
deployment, Stripe code or pricing, authentication flows, RLS policies, secret
rotation, deployment, branch protection, `.gitignore` changes, and adding a
dependency.

And, on the operational side: issuing a refund, changing a user's credits,
deleting a user, deleting production data, and changing access or permissions.
Prepare and verify the action, state exactly what it will do and to which
record, then stop and ask. Standing authorisation exists only where this file
documents it for that exact action.

Level 3 means you stop and ask first. It does not mean you act and then report.

`supabase db push` is the one Level 3 action you may run yourself, and only
after explicit approval in the conversation for that specific push. Nothing
prompts or blocks on your behalf, so that approval is the whole gate: it
applies DDL to a database holding candidate CVs and payment records, and
there is no undo. Verify the migration locally before you reach for it, and
say plainly, before you run it, what it will change.

Edge Function deployment is not yours to run at all, by hand or through the
MCP tool. It happens automatically from `main`, see "Edge Functions deploy
automatically" above, so merging the pull request is the approval step.

## Git

Two remotes, both carrying the same `main`: `origin` and `personal`. `origin`
carries two push URLs, so one `git push` reaches both and prints two `To ...`
blocks. The canonical repository is `fullcircleAI/RecruiterCheck`, which is
what Vercel builds from; `KwabenaOwusu-Agyeman/RecruiterCheck` is the mirror.
Work on a branch rather than committing straight to `main`.

If a session reports that committed work is missing, check which repository it
is looking at before concluding the work was lost. On 2026-09-06 a container
cloned the mirror, correctly found the work absent, and offered to rewrite it.

- Pushing, opening a pull request and merging it are all yours to do without
  asking, `main` included. When `main` moves it goes to both remotes, not one.
- Never force push, `--mirror` or `--delete`. `--force-with-lease` needs
  explicit approval each time. Nothing blocks these for you.
- Merging is no longer a checkpoint, so the checks are the only thing standing
  between a mistake and `main`. Run what `npm run checks` names, every time, and
  do not merge on a red or unrun check.
- Say what you pushed and merged in the report, and which Edge Functions that
  merge deploys. The user is no longer typing these commands, so the
  transcript is the only record they have of them.
- Stage named paths. Never `git add -A` or `git add .`: on 2026-09-06 that
  swept `CLAUDE.md`, `COCKPIT.md` and `memory/README.md` into a commit about
  marketing reporting, under a message that does not mention them. Read
  `git status` before committing and commit only what the work touched.

## Security review triggers

A security review is mandatory, not discretionary, when a diff touches
authentication, payments or credits, RLS policies, Storage or uploads, Edge
Function request handling, or anything that reads candidate data.

## Configuration traps specific to this repo

- `vercel.json` pins a Content Security Policy with roughly fifty inline script
  hashes, tracked in `scripts/csp-managed-hashes.json`. Changing `index.html` or any
  inline script without regenerating the hashes breaks production silently. Check
  this whenever inline script content changes.
- `supabase/config.toml` holds local auth email templates. Production templates live
  in the Supabase dashboard and are maintained by hand. See `BREVO_SETUP.md`.
- `scripts/reset-test-users.ts` permanently deletes users using the service role
  key. It is never part of automated work.
- Several Edge Functions have a test mode flag that must stay on outside production.

## Which checks to run

Run `npm run checks`. It reads the diff and names the relevant checks; run
those. Running the full suite for an unrelated change is noise, not rigour,
and skipping a relevant one is worse.

| Changed | Run |
| --- | --- |
| Scoring, verdicts, evidence logic, thresholds, `analyze-check/**`, `fixtures/synthetic/**` | lint, typecheck, `test:scoring`, `node scripts/mutation-check.mjs` |
| React, components, pages, styling, routing, frontend logic | lint, typecheck, `test:unit` |
| `admin/**` | `test:admin`, then `lint`, `typecheck` and `build` from inside `admin/`; security review for `admin/src/server/**` |
| Edge Functions and backend logic | lint, typecheck, `test:edge` |
| Migrations | local `supabase db reset`, **regenerate types**, `test:edge`, RLS review |
| SEO pages, metadata, sitemap, prerender | `npm run build`, sitemap and metadata check |
| `vercel.json`, `middleware.ts`, `supabase/config.toml` | `npm run build`, CSP hash check |
| Auth, payments, credits, RLS, storage, uploads | mandatory security review, on top of the above |
| Documentation or agent config only | nothing; review the diff |

Two checks have no tooling in this repo and must be reported as
**MANUAL CHECK REQUIRED** rather than skipped silently:

- Browser and console checks. No browser test framework is installed. The
  Chrome connector may be used against `localhost:5173` only, never against
  the hosted site, and the result is still reported as a manual check.
- Structured data validation. No JSON-LD validator exists.

Do not install a framework for either without asking.

Automated testing is local only. Never point a test at the hosted project,
never deploy a function to check something, never apply a migration to
production, and never read production user data to verify a change.

## Failure handling

1. Explain the failure before touching anything.
2. Decide which side is wrong, the test or the code, and say which.
3. Fix only if the fix is genuinely safe and in scope.
4. Rerun the specific check that failed.
5. After two failed attempts, stop and report.

Never weaken a test to make it pass. Never disable a security check to finish a
task. Never delete validation logic without saying plainly what was removed and why.
Never edit an expected score or verdict to make a regression go green: that is the
regression, and rewriting the baseline hides it. A check that is failing for a real
reason is doing its job.

Correcting a test that asserts the wrong thing is legitimate, but it is a reportable
decision, not a silent one. Say what the test asserted, what the code does, and why
the test was the wrong one.

## Working memory

Two files carry state between sessions: `COCKPIT.md`, the current technical
status, and `memory/`, durable corrections. Neither replaces this file, and
neither outranks a primary source.

### Before implementing

1. Read this file.
2. Read the latest relevant entries in `COCKPIT.md`.
3. `grep` the repo for an existing implementation or existing documentation of
   the thing you are about to build. A deliverable with a precedent follows the
   precedent's format.
4. Check `memory/` for a record covering this area.
5. Verify anything important about current behaviour at its primary source, per
   the hierarchy above. Do not assert a current fact from `COCKPIT.md` alone.

### During

Leave unrelated changes alone. Record only durable technical information, and
record it when you learn it, not at the end. Label what is verified, what is an
assumption and what is a proposal, distinctly. Never write a secret, a token, a
candidate document, an email address or a production record into any of these
files.

### After meaningful work

1. Run the checks `npm run checks` names.
2. Produce the report below.
3. Add one concise `COCKPIT.md` entry using its fields: Date, Objective,
   Completed, Verified, Blockers, Founder action required, Next technical step,
   Commit or PR. Keep every field, write "none" where one is empty, and do not
   substitute headings of your own. It is a status record, not a transcript.
4. Move anything still blocking or waiting on the founder into the "Open items"
   block at the top of `COCKPIT.md`, and clear from it whatever this work
   closed. A blocker recorded only inside a dated entry scrolls out of sight.
5. Write a `memory/` record only when the lesson is durable and would plausibly
   prevent the same mistake again. Most work produces no record. Then `grep` for
   the same mistake elsewhere in the repo and fix it there too, the same day.
6. Commit only completed, coherent work.

Push and merge authority is unchanged: see "Git" above. Updating one of these
files is not by itself a reason to push.

### What does not belong in this repo

Notion HQ is the source of truth for company strategy, projects, tasks,
decisions and anonymised customer insights. None of the following is duplicated
here, in `COCKPIT.md`, in `memory/`, or anywhere else in the repository:

company project management · marketing calendars · business metrics · customer
lists · general company decisions · content planning · customer feedback records

An approved Notion decision may be referenced by title, date and safe URL on one
line where it explains a technical constraint. Its content is not restated here.

Three boundaries are sharp enough to state outright, because both sides look
plausible:

- **Metrics.** The Control Centre computes actuals from Supabase and is
  authoritative for them. Notion's Company Metrics holds targets and the
  periodic record and cites the Control Centre as its source. Do not build a
  second calculation of the same number anywhere.
- **Customer feedback.** Raw feedback is product data and lives in Supabase.
  Handling one case is the Control Centre's job. Anonymised insight, and what
  to do about it, belongs in Notion.
- **Scoring.** Notion's Scoring Methodology owns the approved methodology; the
  deployed implementation is authoritative for what runs. If they diverge,
  report it and stop. Never reconcile them silently in either direction, and
  never change scoring as a side effect of other work.

"Content" names three unrelated things: content planning in Notion, SEO page
source in `content/`, content performance in the Control Centre. Say which.

The test for a `COCKPIT.md` entry: it must name a file, a migration, a function,
a test, a commit or a branch. If it could have been written without knowing this
codebase, it belongs in Notion.

## Report format

End any significant implementation with exactly these headings:

```
CHANGE            What changed, in a sentence or two
FILES CHANGED     Files modified
CHECKS SELECTED   What `npm run checks` chose, and why
TEST RESULTS      Commands run and their results
SECURITY/PRIVACY  Checks performed; whether sensitive data was accessed
REGRESSION RISK   Low, medium or high, with the reason
MANUAL CHECKS     What the user still needs to verify
PUSHED            Branch and remotes, or "no"
MERGED            Pull request merged, or "no"
DEPLOYED          Edge Functions this merge deployed, or "none". Say when the
                  frontend went out from the same merge through Vercel.
```

Keep it proportionate. A one-line fix does not need paragraphs under every
heading, but no heading is dropped.

The last three state what happened, not what was withheld. Merging a pull
request that touches an Edge Function is the deploy, so a report that says
nothing deployed after such a merge is false. Name the functions.

## Copy conventions

No dashes anywhere in user facing copy, including ranges, which are spelled out.
Bullet lists in product copy stop at three items. The primary call to action is
labelled "Check".
