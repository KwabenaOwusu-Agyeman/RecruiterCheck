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
- **Known limit, browser verification.** Hydration and console behaviour on the
  live site cannot be observed: `CLAUDE.md` restricts the Chrome connector to
  localhost. A local pass over `dist/` is representative, since the served bytes
  match, but production browser behaviour is **UNVERIFIED** and must be reported
  as such rather than inferred. Recorded 2026-09-10.
- **Founder decision, www root does not redirect.** `https://www.myrecruitercheck.com/`
  returns 200 and serves the homepage rather than redirecting. Every other path
  does redirect: the `vercel.json` rule `"/:path*"` with a `www` host condition
  returns 301 for `/about`, `/pricing`, `/index.html`, `/sitemap.xml`,
  `/robots.txt` and the article routes, but not for the bare root. The homepage
  is therefore reachable on two hostnames. Mitigated, not fixed, by the served
  page carrying `<link rel="canonical" href="https://myrecruitercheck.com/">`.
  The fix is a second redirect entry with `"source": "/"` alongside the existing
  one; it ships through a normal merge and needs no DNS change. Measured
  2026-09-10.

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

## 2026-09-10 — Article 4 published

**Objective.** Publish "Which job requirements are genuinely mandatory", the
third Phase 2 resource article and the first that depended on another article
shipping first: Brief 3 required Article 3 live so this one links back to the
method rather than re teaching it.

**Completed.** One line in
`content/resources/which-job-requirements-are-mandatory.md`, `status: draft` to
`status: published`, the body byte identical to the draft merged in PR #81.
`vercel.json` and `scripts/csp-managed-hashes.json` are `prerender.mjs` output,
60 hashes to 62, since the route now renders `Article` and `BreadcrumbList`.

**Verified.** Live at
`https://myrecruitercheck.com/resources/which-job-requirements-are-mandatory`,
200 and 30,928 bytes, byte identical to the built file: self canonical, `index, follow`, `Article` with
`datePublished` 2026-09-10 and `publisher` and `isPartOf` resolving,
`BreadcrumbList`, one `h1`, seven `h2`, one `h3`, the four approved internal
links, no `/cv-keyword-checker`, no FAQ markup. One `main`, one `header`, one
skip link. Sitemap is 35 URLs with all three articles.

Locally before merge, over `dist/` served by `python3 -m http.server` rather
than `vite preview`: hydration exact, served `#root` 24,921 characters against a
live DOM of 24,921. Zero console output, with capture proven live by a probe
rather than inferred from an empty result. Client side navigation away and back
both worked, and returning fetched the `content-data` JSON, exercising the
fallback. CSP: every executable inline script across the 37 built pages is
covered and the ledger and policy agree at 62. The three uncovered blocks are
the `type="application/json"` embedded content items, which the browser never
executes, and that is unchanged from the two articles already live.

Regression clean: Articles 1 and 3 intact with all five schema blocks and one
landmark of each kind, `X-Robots-Tag: noindex` on `/app-shell.html`, and
one `main`, one `header` and one `h1` on `/`, `/about`, `/faq` and `/pricing`.

Not verified: production browser and hydration behaviour, since `CLAUDE.md`
restricts the Chrome connector to localhost.

**Blockers.** None for this work. Articles 2 and 10 remain blocked on the frozen
consolidation decisions, and A1 on the newsletter content path.

**Founder action required.** Decide whether to fix the www root redirect, which
this run's regression sweep measured for the first time at the bare root. See
Open items.

**Next technical step.** The `vercel.json` root redirect, one entry, if
approved. Otherwise Articles 5 to 9, which have approved pipeline entries in the
Content Authority Map but no briefs yet.

**Commit or PR.** PR #82, merged as `fc58911`.

---

## 2026-09-10 — Article 4 merged as a draft

**Objective.** Draft and land "Which job requirements are genuinely mandatory",
the third Phase 2 resource article, without publishing it. PR #81 merged as
`a3260a6`.

**Completed.** `content/resources/which-job-requirements-are-mandatory.md`, one
new file, 1283 words, seven `h2` and one `h3`, `status: draft`. The piece sorts a
requirements list into genuine gates, requirements describing the system the team
runs, and the aspirational long tail, then gives a four step sort a reader can
run on a real list.

**Written here rather than supplied.** Articles 1 and 3 were founder drafts that
this session implemented. Article 4 was drafted against the approved brief, so
the prose is Claude Code's and deserves closer editorial review than an
implementation would.

**Verified against Brief 4's definition of done.** Thirteen checks, all passing:
all seven sections, the primary question answered in the first two paragraphs,
the statement that a gap is never closed by inventing experience, the link back
to Article 3 instead of re teaching it, the invented list labelled as invented,
the three product links, no `/cv-keyword-checker`, exactly one product mention
and it is last, no men and women application statistic, no percentage or ratio
claim, no real employer named, a real ISO `published` date, and the parser clean
so no dashes and no unsupported markdown.

Where the argument needed a claim about employer behaviour it is framed as
reasoning with the counter case stated, that some teams do want the exact tool.

**The publish order paid off.** Brief 3 required Article 3 to ship first so this
one could link back rather than re teach the reading method. That is what it
does.

**Blockers.** None.

**Founder action required.** None, though the sorted example places "three years
of experience" under the aspirational category, on the reasoning that years are a
proxy for judgement rather than a measure of it. That is the most contestable
call in the piece and the paragraph to change if the founder disagrees.

**Next technical step.** Publication is a separate `draft` to `published` change,
with local browser verification and production verification after merge, as for
Articles 1 and 3.

**Commit or PR.** PR #81, merged as `a3260a6`.

---

## 2026-09-10 — Article 3 published

**Objective.** Publish "How to read a job description before you apply", the
second Phase 2 resource article. PR #80 merged as `d22955d`.

**Completed.** One line, `status: draft` to `status: published`, the body byte
identical to the draft merged in PR #79. `vercel.json` and the CSP ledger are
`prerender.mjs` output, 58 hashes to 60, since the page now renders `Article`
and `BreadcrumbList`.

**Live.** `https://myrecruitercheck.com/resources/how-to-read-a-job-description`
returns 200 and 27,420 bytes of prerendered HTML: self canonical, `index,
follow`, `Article` with `datePublished` 2026-09-10 and `publisher` and
`isPartOf` resolving, `BreadcrumbList`, one `h1`, seven `h2`, one `h3`, the
three approved internal links, no `/cv-keyword-checker`, no FAQ markup, and the
editorial body styling applied. One `main`, one `header`, one skip link. Sitemap
is 34 URLs with both articles present.

**First article to inherit the platform rather than retrofit it.** Article 1
needed the body styling and the landmark work added after publication. Article 3
shipped with both already in place, which is the point of doing them as
platform changes rather than per article fixes.

**Verified locally before merge.** Hydration exact, served `#root` 21,451
characters against a live DOM of 21,451. Zero console output from the page load,
with tracking proven live by a probe rather than inferred from an empty result.
Client side navigation away and back both worked, and returning fetched the
`content-data` JSON, exercising the fallback.

**Regression clean in production.** Article 1 intact with all five schema
blocks and one landmark of each kind; #67 offers, #68 free offer, #69 tool
cluster, #70 entity graph, `X-Robots-Tag: noindex` on `/app-shell.html`, the www
301, and `(1 main, 1 header)` on `/`, `/about`, `/faq` and `/pricing`.

**Blockers.** None.

**Founder action required.** None.

**UNVERIFIED.** Production browser and hydration behaviour, as always:
`CLAUDE.md` restricts the Chrome connector to localhost, so the live page has
never been observed in a browser.

**Next technical step.** Article 4, "Which job requirements are genuinely
mandatory", whose brief is approved. Brief 3 required Article 3 to publish
first so Article 4 can link back to it rather than re teaching the method.

**Commit or PR.** PR #80, merged as `d22955d`.

---

## 2026-09-10 — Article 3 merged as a draft

**Objective.** Land the second Phase 2 resource article, "How to read a job
description before you apply", without publishing it.

**Completed.** `content/resources/how-to-read-a-job-description.md`, one new
file, 1026 words, seven `h2` and one `h3`. The founder supplied the draft; the
only edit was `published`, set to 2026-09-10, the actual implementation date
rather than the placeholder. `status: draft`, so it has no route, no prerendered
page and no sitemap entry. PR #79 merged as `36679f2`.

**Verified against Brief 3's definition of done.** All seven sections, the
primary question answered in the first two paragraphs, the invented posting
example labelled as invented, exactly one product mention and it is the last
line, the three approved internal links, no link to `/cv-keyword-checker`, no
real employer or posting, no invented statistic, and the parser clean so no
dashes in copy and no unsupported markdown. It also holds the boundary the brief
drew against Article 4: the piece says outright that whether a given requirement
is a genuine gate is its own question and does not answer it.

`npm run checks` selected the SEO checks for this file, which it would not have
done before PR #73. Build succeeded with 58 CSP hashes and no change needed,
since a draft renders no page and adds no JSON LD. Production confirmed
unaffected: the URL 404s, the sitemap is still 33 URLs, and Article 1 still
serves 200.

**Blockers.** None.

**Founder action required.** None.

**Next technical step.** Publication is a separate `draft` to `published`
change, with local browser verification and production verification after merge,
exactly as Article 1. Brief 3 says publish this before Article 4, since Article
4 links back to it rather than re teaching it.

**Commit or PR.** PR #79, merged as `36679f2`.

---

## 2026-09-10 — Every page now has exactly one main and one header

**Objective.** Close the two remaining landmark gaps: the five legal pages with
no `main`, and `/about`'s duplicated chrome. PRs #77 `8ca08a5` and #78 `afe6ca2`.

**Completed.** `/faq`, `/privacy`, `/terms`, `/cookies` and `/disclaimer` route
outside `PublicLayout` and use `LegalLayout`, which rendered a plain `div`, so
their `h1` and whole body sat in **no landmark at all**. `LegalLayout` now
renders the landmark itself, around the content and never around the header
above it, plus the skip link.

`/about` is the one `LegalLayout` page routed INSIDE `PublicLayout`, so both
layouts supplied the same chrome and it rendered **two** headers, **two** Back
controls and **two** logos, meaning two `banner` landmarks. The `standalone`
prop, which already meant "provide my own page chrome", now governs the header
and back link as well as the skip link and landmark. `/about` keeps
`PublicHeader`, the better of the two, and loses the redundant logo bar.

`src/components/ui/SkipLink.tsx` is shared by both layouts, carrying
`MAIN_LANDMARK_ID` with it so the link and the landmark cannot disagree.

**Verified in production.** Ten pages sampled across every layout: `/about`, the
five legal pages, `/`, `/pricing`, `/ats-resume-checker` and the article. All
report exactly one `main`, one `header` and one skip link. Nothing has a
duplicate of either. The homepage correctly has no back link. Regression clean:
article schema, canonical, robots, body styling and its three links; #67 offers,
#68 free offer, #69 tool cluster, #70 entity graph, `X-Robots-Tag: noindex`, the
www 301, and a 33 URL sitemap.

Locally, across the whole prerendered build, 34 of 35 pages are `(1 main, 1
header)`; the remaining one is `app-shell.html`, a rewrite target rather than a
page and already `noindex`.

**Blockers.** None.

**Founder action required.** None.

**Rejected, and why.** Moving `/about` out of `PublicLayout` to match its five
siblings would have swapped the full navigation header for the logo only one and
dropped the sticky call to action. That is a UX downgrade on a marketing page and
a founder decision, not a mechanical fix.

**Commit or PR.** PRs #77 and #78, merged as `8ca08a5` and `afe6ca2`.

---

## 2026-09-10 — One main landmark per page, and a skip link

**Objective.** Audit item from the nested `<main>` finding. PR #74, merged as
`91b8d84`.

**Completed.** Twenty six pages served two `<main>` elements, one nested inside
the other, and Chrome exposed BOTH as landmarks, so a landmark list showed two
entries and rotor navigation cycled through both. The outer one's only distinct
content was the Back button. `SeoLandingPage`, `PricingPage`, `EditorialPage`,
`HowInterviewScoreWorksPage` and `NotFoundPage` now return a fragment and
`PublicLayout` owns the single landmark. No SEO page file was touched: the 23 SEO
pages never rendered a `main` themselves, the shared component did. Every `main`
removed was bare with no className, so there was no visual change.

Also adds a skip link, which the site had none of. First focusable element,
hidden until focused, jumping to `#main-content`, whose `tabIndex={-1}` is what
makes Safari move focus rather than only scroll.

**Verified in production.** 1 `main` and a skip link on the article, `/`,
`/pricing`, `/ats-resume-checker`, `/how-interview-score-works` and `/about`.
The article page's count had never been checked before, since #74 was verified
while the article was still a draft and had no page. Regression clean: article
canonical, robots, five schema blocks, 6 `h2`, 1 `h3`, 4 list items, the styling
child selectors and the three approved links all intact; #67 offers, #68 free
offer, #69 tool cluster, #70 entity graph, `X-Robots-Tag: noindex` and the www
301 all unchanged; sitemap 33 URLs with the article present.

**Blockers.** None.

**Founder action required.** None.

**Not addressed, by decision.** The five legal pages with no landmark, now the
open item above.

**Commit or PR.** PR #74, merged as `91b8d84`.

---

## 2026-09-10 — Article 1 published

**Objective.** Ship the first Phase 2 resource article, with the check selection
fix and the editorial body styling that had to land first.

**Completed.** Three merges in sequence. PR #73 `a874890` fixed
`scripts/which-checks.mjs`, which classified every `.md` as documentation and
exited before any rule ran, so an article PR reported "no code checks needed"
while producing an indexable page; two rules were dead, the SEO one and the
newsletter one. PR #76 `74a1760` styled the editorial body. PR #75 `10ce42d`
flipped `status: draft` to `status: published`, one line, the body byte
identical to the approved package.

**Live.** `https://myrecruitercheck.com/resources/why-a-cv-passes-ats-and-is-still-rejected`
returns 200 and 26,439 bytes of prerendered HTML: self canonical, `index,
follow`, `Article` with `datePublished` 2026-09-08 and `publisher` and
`isPartOf` resolving to `#organization` and `#website`, `BreadcrumbList` of
Home, Resources, article, one `h1`, six `h2`, one `h3`, four list items, exactly
the three approved internal links and no `/cv-keyword-checker`, no FAQ markup.
Sitemap is 33 URLs with the article at `lastmod` 2026-09-08. The styling child
selectors are present in the served markup.

**The styling fix was necessary, not cosmetic.** Browser verification measured
the body as unstyled: `h2` and `h3` rendered at 16px weight 500, identical to a
paragraph, in body links rendered in the body text colour with no underline, and
lists had no markers and no indent. Tailwind's Preflight resets those and the
parser emits bare tags. After: `h2` 30px Fraunces, `h3` 18px weight 600, links
`rgb(25,74,159)` underlined, lists disc with indent.

**Verified.** Hydration confirmed by comparing served `#root` against the live
DOM, 20,424 characters both sides, so React reused the server markup rather than
replacing it. Zero console messages, with tracking proven live by a probe first
rather than assumed from an empty result. Client side navigation works, and
returning to the article fetches `/content-data/...json`, exercising the
fallback. Regression across every shipped PR is clean: #67 offers, #68 free
offer, #69 tool cluster, #70 entity graph, plus `X-Robots-Tag: noindex` on
`/app-shell.html` and the www 301.

**Blockers.** None.

**Founder action required.** None.

**UNVERIFIED, and unavoidable.** Production browser and hydration behaviour.
`CLAUDE.md` restricts the Chrome connector to localhost, so the live page has
never been observed in a browser. The local result is representative, since the
served bytes match `dist/`, but it is not the same claim.

**Next technical step.** PR #74, the single `main` landmark and skip link, is
open and independent. Article 3 has an approved brief and is not drafted.

**Commit or PR.** PRs #73, #76 and #75, merged as `a874890`, `74a1760` and
`10ce42d`.

---

## 2026-09-08 — Hydration investigation closed, not a bug

**Objective.** Find the root cause of React #418 and #423, reported as firing
site wide. Investigation only.

**Outcome. There is no hydration bug.** The errors were an artifact of the
reproduction method, and the earlier report of a site wide defect, including its
per page error counts, was wrong.

**Root cause of the false positive.** `npx vite preview` applies an SPA fallback
and serves `dist/index.html`, the prerendered **landing page**, for every route.
React therefore hydrated the landing page's markup against a different page's
component tree. Measured: `/pricing` and `/ats-resume-checker` were both served a
71,177 byte landing page instead of their own 30,221 and 23,537 byte files. A non
minified React build named it exactly, `Expected server HTML to contain a
matching <div> in <main>`, that div being the BackLink `Container` that
`PublicLayout` renders on every route except `/`.

**Verified.** Serving `dist/` with directory index behaviour, `cd dist &&
python3 -m http.server 5173`, which is what Vercel does, the same build with the
same non minified React produced **zero** hydration errors on `/`, `/pricing/`
and `/ats-resume-checker/`. Production serves the prerendered file: production
`/pricing` returns `<title>Pricing | MyRecruiterCheck</title>`, not the landing
page. `usePageMeta`, `useAuth`, `AuthModalContext`, `PublicLayout` and the
viewport helpers were each checked and are not responsible.

**Impact on users.** None. No mismatch occurs in production, so no page discards
its server rendered DOM. Prerendered HTML was always correct, so search and AI
crawlers were never affected.

**Method adopted.** Browser verification uses a static server over `dist/`, never
`vite preview`. Recorded durably in
`memory/2026-09-08-vite-preview-is-not-production-routing.md`, with the
development React build recipe needed to get a component name out of a minified
hydration error.

**Correction carried forward.** Article 1's browser verification items for direct
load, client side navigation and hydration were measured through `vite preview`
and are **void**. They must be redone against a static server once the article is
published. The checks made directly against the prerendered files, metadata,
canonical, structured data, links, sitemap and indexability, remain valid.

**Blockers.** None.

**Founder action required.** None.

**Next technical step.** Merge PR #73, the check selection fix, then the separate
Article 1 `draft` to `published` change. Publication is not blocked by either
finding here.

**Commit or PR.** No application change. Investigation only.

---

## 2026-09-08 — Article 1 merged as a draft

**Objective.** Implement the founder approved Phase 2 Article 1 exactly as supplied,
verify it, and merge it **without publishing it**.

**Completed.** `content/resources/why-a-cv-passes-ats-and-is-still-rejected.md`, one
new file, 972 words. The only edit to the supplied package was `published`, set to
the actual implementation date rather than a backdated or inferred one.
`status: draft`, so the article has no route, no prerendered page and no sitemap
entry. PR #72 merged as `b413152`.

**Verified.** All 14 requested checks were performed, not assumed. A draft has no
page, so verification required temporarily setting `status: published` locally,
checking, then restoring `draft`; the temporary state was never committed, and the
CSP ledger returned from 58 hashes to 56, confirming a clean restore. Direct load
200 and 71,177 bytes; client side navigation confirmed by a `window` marker
surviving a link click, so no reload; navigating back fetched
`/content-data/...json`, exercising the fallback; 972 words, six `h2`, one `h3`,
four list items; title, description, Open Graph, self canonical, `Article` with
`datePublished` and `publisher` and `isPartOf` resolving, `BreadcrumbList`; exactly
the three approved internal links and **no** `/cv-keyword-checker`; sitemap entry
present when published and absent as a draft; `index, follow`; no FAQ markup.
Production confirmed unchanged after merge: the URL 404s, the sitemap is still 32
URLs.

**Two findings, both recorded as open items rather than fixed here.**

Browser verification surfaced React **#418 and #423** on the article. The article
does **not** cause them: `/ats-resume-checker` and `/pricing`, untouched by that PR,
throw three `#418` and one `#423` each, against the article's two and one. Site wide
and pre existing. Prerendered HTML is unaffected, so crawlers see the full page, but
every page currently discards its server rendered DOM and re renders on the client.

`npm run checks` selects **nothing** for an article. `scripts/which-checks.mjs` has
`DOCS_ONLY = /(\.md$|...)/` and exits before evaluating any rule, so every future
article PR will report "no code checks needed" despite producing an indexable page.
The correct checks were run by hand for this one.

**Blockers.** None for this work.

**Founder action required.** None.

**Next technical step.** Engineering task 1, the `which-checks.mjs` fix, then task 3,
the `draft` to `published` change for Article 1. Task 2, the hydration
investigation, is independent and is investigation only.

**Not implemented, deliberately.** Google Preferred Sources. It is a strategic search
visibility and user preference opportunity, not a website feature. No button, schema
property or code exists, and none should be added. Source quality is built through
the editorial strategy in Notion, not through a technical feature.

**Commit or PR.** PR #72, merged as `b413152`.

---

## 2026-09-08 — Content publishing Phase 1: dynamic routes, generated sitemap

**Objective.** Build the one publishing architecture for every editorial content
type, with zero content published. Approved in Notion, see the
**MyRecruiterCheck Publishing Architecture Brief**.

**Completed.** Source of truth is markdown in `content/`, indexed at build time
by `src/content/load.ts` through a Vite glob. `content/resources/<slug>.md`
serves `/resources/<slug>`, `content/issues/<slug>.md` serves
`/newsletter/<slug>`. `scripts/prerender.mjs` no longer holds a literal route
array: it reads hand built routes from `src/routes/static-routes.ts` and content
routes from the index, both re exported through the SSR bundle because it is
plain `.mjs`. `public/sitemap.xml` is deleted and generated by
`scripts/build-sitemap.mjs`. `src/pages/EditorialPage.tsx` renders one item with
`Article` and `BreadcrumbList` joined to the entity graph from PR #70.

**Directory naming is deliberate.** `scripts/which-checks.mjs` excludes
`content/newsletter/` from the SEO rule, correctly, because that path holds
email copy nothing prerenders. Published issues therefore live in
`content/issues/`, not under `content/newsletter/`, or publishing one would have
selected the wrong checks silently.

**`lastmod` without hand maintenance.** Hand built pages read
`scripts/static-lastmod.json`, generated from git by `npm run sitemap:lastmod`
rather than typed. It is a committed snapshot, not a build time git read,
because Vercel clones shallow and `git log` there can return nothing: the build
fails on a missing route rather than guessing. Content items use `updated`,
falling back to `published`, both validated ISO dates.

**The static sitemap was already stale.** Regenerating showed eight routes with
wrong dates: the seven tool pages from PR #69 and `/about` from PR #70 changed
without the file being edited. URL set, order, `changefreq` and `priority` are
identical; those eight `lastmod` values are corrections.

**Two latent parser bugs found and fixed.** Neither had surfaced because no
newsletter piece had used the syntax. A leading list marker tripped the dash
rule, so the format documented unordered lists as supported while rejecting
every one. A hyphenated link target tripped it too, which makes an in body link
to any page on this site impossible, since every internal URL here is
hyphenated. Markdown syntax is now stripped before the dash check; prose is
still governed. Headings are opt in, so `loadPiece` is unchanged for the
newsletter and its 13 existing cases pass untouched.

**Verified.** Lint 0 errors, 2 pre existing warnings, unchanged: the four new
`react-refresh` warnings on the SSR entry are suppressed at that file with the
reason, since Fast Refresh only governs the client graph. Typecheck clean.
`test:unit` 15/15 files and 198 assertions, `test:edge` 24/24 and 401. Build
succeeds, 56 CSP hashes verified with no change needed. Proven end to end with a
temporary fixture, since removed: a published file produced a route, a
prerendered page, `content-data` JSON, correct canonical, title, description and
Open Graph, valid `Article` and `BreadcrumbList`, and a sitemap entry; a draft
alongside it appeared nowhere in `dist/` at all; `noindex: true` kept the page
but dropped it from the sitemap; and removing both fixtures returned the CSP
ledger from 58 hashes to 56, so the reclaim works.

**Blockers.** None.

**Founder action required.** None.

**Verified in production.** The generated sitemap serves 32 URLs, valid XML,
every one with a `lastmod`, none future dated, and all eight corrected dates
live. All 32 URLs return 200. `/resources/<slug>` and `/newsletter/<slug>`
return 404, correctly, since nothing is published. The Vercel build generated
the sitemap from the committed `static-lastmod.json` snapshot, so the shallow
clone risk is closed rather than merely mitigated. Regression across all five
merged PRs is clean: #67's `Product` image and 10/20/40 offers, #68's free offer
plus `X-Robots-Tag: noindex` and the www 301, #69's tool cluster, #70's entity
graph with `publisher` references resolving and no `founder` node.

**Next technical step.** Phase 2 publishes the first approved articles. Phase 3
brings newsletter issues in through a scheduled GitHub Action that reads a
completed `newsletter_issues` row and opens a pull request, which is Level 3.

**Commit or PR.** PR #71, merged as `298c91c`. Branch
`content-publishing-phase1`, commit `f9082ad`.

---

## 2026-09-08 — SEO A3: entity graph connected, Organization enriched

**Objective.** Audit item A3. The sitewide `Organization`, `WebSite` and
`SoftwareApplication` blocks were three unconnected nodes with no `@id` and no
relationships. Week 3 (A1, the newsletter archive) was deferred: see the
blocker recorded below.

**Completed.** `index.html`'s three blocks gained stable `@id` values and
reference each other; `Organization` gained `address.addressCountry` and a
support `contactPoint`; `WebSite` gained `inLanguage` and `publisher`;
`SoftwareApplication` gained `publisher`. `src/pages/AboutPage.tsx` gained an
`AboutPage` node (`isPartOf` the website, `mainEntity` the organisation) and a
`BreadcrumbList`. Kept as separate blocks rather than one `@graph`: Google
resolves `@id` across blocks on a page, and merging would have rewritten the
`SoftwareApplication` verified in PR #68.

**Facts and their sources.** Country from "operates from the Netherlands"
(`AboutPage`, `PrivacyPage:16`, `TermsPage:17`, `llms.txt`); support address
from `TermsPage:105` and `PrivacyPage:105`; `inLanguage` from
`<html lang="en">`; `dateModified` from the "Last updated" date already
rendered on the About page. Nothing inferred.

**Verified.** Lint 0 errors (two pre existing `react-refresh` warnings),
typecheck clean, `test:unit` 14/14 and 181 assertions, build succeeded with the
CSP reconciled +5/-3 to 56 hashes. 155 `application/ld+json` blocks parse; no
conflicting `@id` definition and no unresolved `@id` reference anywhere in
`dist/`; 34 pages each carry the three sitewide entities with stable ids; 32
sitemap URLs clean. Google's Rich Results Test on the enriched pair returns
**2 valid items detected**, `Organization` and `Software Apps`. Organization's
three non critical issues are all optional address fields, `streetAddress`,
`addressLocality` and `postalCode`, which the repo has no facts for.

**Blockers.** None.

**Founder action required.** None. Of the four facts the repo could not
supply, the founder confirmed `foundingDate` as 2026, which is now on the
`Organization` and is consistent with the first commit, 2026-08-08. The other
three were declined and are deliberately absent, not outstanding: no founder
`Person` node, no registered entity name or KvK number, and no street level
address. Do not add them in a later session without a fresh decision.

**Next technical step.** A1, the newsletter archive, is blocked on a content
path, not on code. `content/newsletter/pieces/` holds two prose sections of a
single week 37 issue, not issues, and is vestigial: the live job calls
`loadPiece()` on model generated text at
`publish-weekly-newsletter/index.ts:309`, not on those files. The only issue
frame in the repo, `scripts/newsletter/example-issue.json`, carries fabricated
postings. Real issues live in `public.newsletter_issues`, service role only, in
production. The table's own migration comment records why: an edge function
cannot write to the repo, so the table replaced the committed issue file. A
prerendered archive therefore has no repo source to read, and giving it one is
a Level 3 design decision.

**Verified in production.** After the merge, `/about` serves all five nodes
with the references resolving: `AboutPage` to `#website` and `#organization`,
`WebSite` and `SoftwareApplication` to `#organization`. `foundingDate` 2026,
`addressCountry` NL and the support `contactPoint` are live; no `founder` or
`Person` node anywhere. No unresolved `@id` reference across `/`, `/about`,
`/pricing`, `/cv-keyword-checker` or `/myrecruitercheck-vs-chatgpt`. Regression
across all four merged PRs is clean: #67's `Product` image, 10/20/40 offers and
`BreadcrumbList`, #68's free offer plus `X-Robots-Tag: noindex` on
`/app-shell.html` and the www 301, and #69's tool cluster.

**Commit or PR.** PR #70, merged as `7bbbdf2`. Branch `seo-a3-entity-graph`,
commit `3f71f5b`.

---

## 2026-09-08 — SEO week 2: tool page cluster, pricing inbound links

**Objective.** Week 2 of the Google and AI search visibility audit: F2 and F3,
the internal linking items. No schema, content or product change.

**Completed.** The seven tool pages (`TailorCvToJobPage`,
`CvKeywordCheckerPage`, `CoverLetterGeneratorPage`,
`RecruiterMessageGeneratorPage`, `ResumeStrengthsWeaknessesPage`,
`JobApplicationFeedbackPage`, `RecruiterEvaluationPage`) now cross link their
six siblings through the existing `relatedLinks` prop on `SeoLandingPage`, and
each links `/pricing`. Six single line arrays were normalised to the multi line
form already used elsewhere.

**Verified.** `npm run checks` selected lint, typecheck, `test:unit`, build and
the sitemap and metadata check. Lint clean bar the two pre existing
`react-refresh` warnings; typecheck clean; 14/14 test files, 181 assertions;
build succeeded and needed no CSP change, since `relatedLinks` are not inline
scripts. Measured from the prerendered HTML: every tool page reaches all six
siblings plus `/pricing`, no duplicates, no self links. Inbound internal links
`/cv-keyword-checker` 1 to 6, `/recruiter-message-generator` 1 to 6,
`/how-recruiters-evaluate-a-cv` 2 to 8, `/pricing` 2 to 9. PR #67's role and
comparison clusters confirmed intact; 153 `application/ld+json` blocks still
parse; 32 sitemap URLs still clean.

**Blockers.** None.

**Founder action required.** None.

**Next technical step.** The remaining weak pages are `/about`, `/terms`,
`/privacy`, `/cookies` and `/disclaimer` at one inbound link each, and `/faq`
at three. They were reachable through the footer, which
`src/layouts/PublicLayout.tsx` renders on the landing page only by explicit
design. `/about` at one inbound is the one with search value; it is audit item
A3, entity enrichment, not a linking fix. Week 3 is the newsletter archive
(A1).

**Note on the footer.** `PublicLayout` renders `PublicFooter` only when
`pathname === '/'`, documented in place as deliberate: every other public page
ends on its own call to action and a second full sitemap competed with it.
This is why 31 of 32 public pages carry only a header link plus `relatedLinks`,
and why `relatedLinks` is the only internal linking lever on them. Recorded so
a later session does not read the thin link graph as a bug and reinstate the
footer.

**Verified in production.** After the merge, all seven tool pages serve the
complete cluster live: each reaches its six siblings plus `/pricing`, no
duplicates, no self links. Regression sweep clean against production: PR #67's
role and comparison clusters intact, `/pricing` still carries `Product` with
the OG image and the 10/20/40 offers plus `BreadcrumbList`, PR #68's
`SoftwareApplication` free offer present, `/app-shell.html` still
`X-Robots-Tag: noindex`, www still 301, robots still disallows `/sign-in`.

**Commit or PR.** PR #69, merged as `84f49eb`. Branch
`seo-week2-tool-cluster`, commit `c801804`.

---

## 2026-09-08 — SEO week 1: schema validity, crawl hygiene, www redirect

**Objective.** Week 1 of the Google and AI search visibility work: the P0/P1
correctness and plumbing items from the audit. No content or product change.

**Completed.** `index.html`'s sitewide `SoftwareApplication` gained the free
offer at price 0, verified against Google's Software App requirements
(`name` + `offers.price` + a rating or review). `vercel.json` gained an
`X-Robots-Tag: noindex` rule scoped to `/app-shell.html` and a www to apex
redirect at `statusCode` 301. `public/robots.txt` now disallows `/sign-in`
and `/sign-up`.

**Verified.** `npm run checks` selected `npm run build`, a sitemap and
metadata check against `dist/`, and the CSP hash check. Build succeeded and
reconciled the `SoftwareApplication` hash (+1/-1, 54 total). All 153
`application/ld+json` blocks in `dist/` parse; all 34 `SoftwareApplication`
blocks carry the price 0 offer and neither `aggregateRating` nor `review`.
All 32 sitemap URLs prerender with matching canonical, title and
description; no sitemap URL is blocked by the new robots rules;
`/app-shell.html` is deliberately absent from robots.txt. CSP hashes needed
by `dist/` (54), allowed in `vercel.json` (54) and the managed ledger (54)
all agree.

**Blockers.** None.

**Founder action required.** None. Both post deploy checks passed against
production after the merge: `/app-shell.html` returns `X-Robots-Tag: noindex`,
and `https://www.myrecruitercheck.com/<path>` returns 301 to the apex with the
path preserved. The `vercel.json` `has` host redirect fired correctly, so no
Vercel dashboard domain change was needed.

**Verified in production.** 7/7 post deploy assertions passed (F1, F4, F5,
F12). Regression sweep clean: apex, `/pricing`, `/sitemap.xml` and
`/robots.txt` all 200, an unknown path still 404s, and PR #67's `Product`
image plus the 10/20/40 offers and `BreadcrumbList` are intact on `/pricing`.
Google's Rich Results Test on the new `SoftwareApplication` block reports
**1 valid item detected**, with `aggregateRating` flagged only as a
non-critical optional field. That contradicts the Software App reference
documentation, which lists a rating or review among the required properties:
the tool treats `offers.price` alone as sufficient for eligibility. Recorded
because it lowers the priority of adding a rating.

**Next technical step.** Week 2 of the audit: the tool page internal linking
cluster. `/cv-keyword-checker` and `/recruiter-message-generator` currently
have one inbound internal link each and `/pricing` has two.

**Resolved.** `/newsletter/unsubscribe` returning 404 is not a live broken
link. The production newsletter footer links to Brevo's hosted unsubscribe on
the `mail.` subdomain, not to this route, confirmed against a real send on
2026-09-08. The route at `src/App.tsx:111` is vestigial; removing it is
optional cleanup, not a fix.

**Commit or PR.** PR #68, merged as `632d479`. Branch
`seo-week1-correctness`, commit `249f9c3`.

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
validator, and a browser and console pass against `localhost:5173`.

**Next technical step.** None. The `Offer` description initially read "5
Recruiter Checks. 5 Recruiter Checks, Interview Score, ..." because
`features[0]` in `CHECK_PACKS` already states the count the template
prefixed. Fixed in `fc5b5a0` by joining `features` alone, which keeps the
count and loses the repeat. That changed the block's CSP hash, so
`prerender.mjs` swapped it in `vercel.json` and
`scripts/csp-managed-hashes.json`.

**Commit or PR.** PR #67, merged as `7f4add7`. Five commits on
`seo-schema-and-cross-links`: `a972215` the schema, sitemap and cross links,
`fc5b5a0` the `Offer` description fix, `618d9b5` the `Product` `image` field
that cleared the one critical Rich Results issue, plus two Cockpit entries.
No Edge Functions in the diff, so the merge deployed none; the frontend went
out through Vercel.

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
