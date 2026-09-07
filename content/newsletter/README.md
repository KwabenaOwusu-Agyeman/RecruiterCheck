# Newsletter copy

`pieces/` holds the prose sections of a built issue. `piece.ts` loads these, so
each one needs frontmatter and must obey the format:

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
