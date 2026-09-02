# MyRecruiterCheck: agent working rules

MyRecruiterCheck analyses a candidate's CV against a job description and returns a
recruiter style score. The data it handles is candidate CVs, candidate contact
details, Stripe payment records and Supabase auth accounts. Treat every rule below
as binding, not advisory.

There is no separate enforcement layer. `.claude/settings.json` carries no
permission rules, so nothing blocks or prompts on your behalf: this file is the
only set of rules, and following it is entirely your responsibility. Where a
rule below says an action needs approval, stop and ask in the conversation.

## Stack

React 18 + TypeScript + Vite (SPA with SSR prerender), Tailwind, React Router.
Supabase for auth, Postgres, Storage and Edge Functions. Stripe for payments.
Vercel for hosting. A browser extension lives in `recruitercheck-extension/`.

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
npm run verify       lint, typecheck and the full suite
npm run checks       Which checks the current diff actually needs
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
never touches function secrets; both stay manual.

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

Two remotes, both carrying the same `main`: `origin` and `personal`. When `main` is
pushed it goes to both. Work on a branch rather than committing straight to `main`.

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
NOT PUSHED
NOT DEPLOYED
```

Keep it proportionate. A one-line fix does not need paragraphs under every
heading, but no heading is dropped.

## Copy conventions

No dashes anywhere in user facing copy, including ranges, which are spelled out.
Bullet lists in product copy stop at three items. The primary call to action is
labelled "Check".
