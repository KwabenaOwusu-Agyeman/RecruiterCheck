# Newsletter copy

Two directories, two different things.

## `pieces/`

The prose sections of a built issue. `piece.ts` loads these, so each one needs
frontmatter and must obey the format:

```
---
heading: The section heading a reader sees
image: /newsletter/one-of-the-four-images.jpg
imageAlt: What the image shows
---

Paragraphs, and unordered lists where they help.
```

No `#` headings, tables, code blocks, block quotes or inline images. The
frontmatter carries the heading and the image; a heading in the body would be a
second one. `piece.ts` reports each of these rather than silently mangling it.

No dashes anywhere, ranges spelled out, per the copy conventions in
`CLAUDE.md`. The build refuses to render an issue that breaks them.

## The numbered drafts

`01-strong-cv-wrong-job.md` through `04-contact-recruiter.md` are a bank of
drafts held for future issues. **They are deliberately unreferenced. Do not
delete them as dead files.**

They predate the current format and are not loadable as they stand. To use one:

1. Move it into `pieces/` under a name ending in the week, as
   `pieces/<topic>-week<N>.md`.
2. Replace its `#` heading line with a frontmatter block, moving the heading
   text into `heading:`. A `#` heading in the body is refused.
3. Pick an image from `public/newsletter/` and give it alt text.
4. Point the week's JSON frame at the new filename and rebuild.

Each is between 60 and 80 words, which fits the budget: the whole issue is one
minute, not one minute per section, and `issue.ts` enforces that over
everything a reader reads.

Judged against the two prose slots, one is worth converting and the others are
weaker than they look:

- `01-strong-cv-wrong-job.md` is the usable one. "Well written and still fails
  to show why you fit one specific role" is a distinct pain from week 37's, and
  worth the rejection slot. Its body is advice and would be rewritten; only the
  premise survives.
- `02-first-recruiter-scan.md` is week 37's rejection piece already, near enough
  word for word.
- `03-show-impact.md` and `04-contact-recruiter.md` are general application
  advice, which the format rules out. The rejection section is the pain and
  nothing else: the product is the resolution and it sits in the call to action,
  so resolving it in the copy spends the only reason to click.

None of the four is a hiring trend, and trends is the section needing new
material weekly. They are evergreen advice with no observation in them. The
postings gathered for section one are the natural source, since what changed in
job descriptions falls out of reading them.
