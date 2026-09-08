Date
2026-09-08

Incorrect assumption or mistake
That `npx vite preview` serves the prerendered build the way production does, so
a hydration error seen there is a hydration error in production. It is not, and
it was not. Three pages were reported as having a site wide React hydration
defect, with per page error counts, and a follow up investigation was opened for
a bug that did not exist.

Why it was wrong
`vite preview` applies an SPA fallback: every route is served `dist/index.html`,
the prerendered LANDING page, rather than the prerendered file for that route.
So React hydrated the landing page's markup against a different page's component
tree, and the mismatch was guaranteed and meaningless.

The measurement looked convincing, which is what made it dangerous. It was
reproducible, it varied per page, and the varying counts looked like real signal.
They were not: the counts differ only because the landing page's markup differs
more from some component trees than others.

Verified correct rule
Serve the built directory itself, with directory index behaviour, which is what
Vercel does:

    cd dist && python3 -m http.server 5173

Confirmed on 2026-09-08 with a non minified React build. Through `vite preview`,
`/pricing` and `/ats-resume-checker` were served a 71,177 byte landing page
instead of their own 30,221 and 23,537 byte files, and threw
`Expected server HTML to contain a matching <div> in <main>`, that div being the
BackLink `Container` that `PublicLayout` renders on every route except `/`.
Through the static server, the same pages on the same build produced ZERO
hydration errors.

CLAUDE.md restricts the Chrome connector to localhost, so this is also the only
way to observe hydration at all. Production hydration remains unobservable and
must be reported as UNVERIFIED rather than inferred from a local pass.

How to prevent recurrence
Before reporting any hydration or client rendering finding, confirm the server
under test actually served the prerendered file: compare the served `<title>` and
byte count against the file in `dist/`. If they differ, the tool is the bug.

Reproduce hydration errors with a development React build, because the minified
message names no component: `NODE_ENV=development npx vite build --mode
development`, the same for the `--ssr` build, then `node scripts/prerender.mjs`.
Rebuild normally afterwards, and check `vercel.json` and
`scripts/csp-managed-hashes.json` are unchanged, because prerender reconciles CSP
hashes on every run and a failed debug build can strip them.
