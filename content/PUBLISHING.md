# Publishing format

Every published editorial item is one markdown file with frontmatter.

    content/resources/<slug>.md    ->  /resources/<slug>
    content/issues/<slug>.md       ->  /newsletter/<slug>

Strategy does not live here. Clusters, search intent, priority, cannibalization
and consolidation decisions are owned by the Content Authority Map in Notion HQ.
This file documents the format only.

## Frontmatter

    ---
    type: article            # article | guide | newsletter
    slug: why-a-cv-is-rejected
    title: The title a reader sees
    description: One sentence, used as the meta description and OG description.
    published: 2026-09-08    # ISO date. Never inferred, never invented.
    updated: 2026-09-10      # optional, drives sitemap lastmod and dateModified
    status: draft            # draft | review | published
    cluster: recruiter-evaluation
    supports: /ats-resume-checker, /free-cv-checker
    image: /social/og-image.png
    imageAlt: What the image shows
    noindex: false
    ---

`status: published` is the only value that produces a page. A draft is parsed
and validated, so mistakes surface early, but it has no route, no prerendered
file and no sitemap entry. It cannot be accidentally indexed because it does not
exist as a page.

## Body

Paragraphs, unordered lists, `##` and `###` headings, links, bold and italic.
A single `#` is refused: the page already has an h1. Tables, code blocks, block
quotes and inline images are refused rather than silently mangled.

No dashes anywhere, ranges spelled out, per the copy conventions in CLAUDE.md.
The build refuses a file that breaks this.

The source is escaped before any markup is produced, so raw HTML in a file is
inert text rather than something a sanitiser has to catch.
