Date
2026-09-21

Incorrect assumption or mistake
Drafting an article's before and after example from what felt like a fresh
scenario, without comparing it to the supported product page's own worked
example. The first draft of Article 5 used a document Q and A tool on a vector
database with retrieval accuracy checked. That is the scenario already live on
`/ai-engineer-cv-checker`, and Brief 5 says in terms that the article must not
reuse the product page's own worked example.

Why it was wrong
The most natural illustration for a topic is the one the page for that topic
already uses, so a drafter reaches for it without noticing. A phrase comparison
does not catch it: the first draft shared zero six word runs with the page's
example and only three four word runs, because the wording differed while the
scenario, the tools and the thing that was checked were the same. A repeated
scenario is the overlap the brief's cannibalization table exists to prevent,
and it gives the article less reason to exist beside the product page.

Verified correct rule
Compare examples by scenario, not by wording. Before writing one, read the
`example` prop of the page the article supports and choose a different kind of
project: a different task, different tools, a different thing that was
evaluated.

How to prevent recurrence
For each article, read the supported page's `example={{ ... }}` before drafting,
then check the finished draft against the brief's definition of done line by
line, including the examples line. Articles 6 to 9 each support a page that has
its own worked example, so the same trap applies to every one of them.

Affected files or systems
`content/resources/*.md` and the `example` prop in `src/pages/*.tsx`, most
directly `src/pages/AiEngineerCvCheckerPage.tsx`. The mistake was caught before
the draft merged and never reached a published page.

Source used for verification
Brief 5 in the Content Authority Map in Notion, under Examples to use;
`src/pages/AiEngineerCvCheckerPage.tsx`; a shingle comparison of the first draft
against that page's example (0 shared six word runs, 3 shared four word runs);
and the same six word comparison of all four published articles against every
page example, which found no verbatim overlap in any of them.
