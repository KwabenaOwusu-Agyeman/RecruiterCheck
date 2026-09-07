// Loads one prose section of a newsletter issue from markdown.
//
// The two prose sections, the rejection piece and the trends piece, are written
// as markdown files with frontmatter rather than as strings inside the weekly
// JSON. Writing two hundred words as a JSON value with escaped newlines is
// miserable, and a read time cannot be trusted if a human typed it.
//
// Deliberately smaller than a general markdown pipeline. A piece is paragraphs
// and the occasional list. It needs no headings, because the section already
// has one, and no categories, because the format fixes what each section is.
//
// SAFETY: the source is escaped BEFORE any markup is produced, so raw HTML in a
// piece is inert rather than sanitised. There is no allowlist to get wrong.

/**
 * Words per minute used for the read time shown on a piece.
 *
 * There is deliberately no per piece word target. The format budgets the WHOLE
 * issue at one minute, and issue.ts enforces that. A second target here would
 * compete with it: two pieces each passing their own check can still put the
 * issue over, which is exactly how the first draft reached three minutes.
 */
export const WORDS_PER_MINUTE = 200

export interface Piece {
  heading: string
  /** Rendered paragraphs and lists, ready to drop into the email. */
  html: string
  /** Whole minutes, floored at one. */
  readMinutes: number
  wordCount: number
  image?: { url: string; alt: string }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Inline formatting, applied to already escaped text. Bold before italic. */
function renderInline(escaped: string): string {
  return escaped
    // https and same origin paths only. Anything else stays literal text, so a
    // javascript: or data: URL can never become a link.
    .replace(
      /\[([^\]]+)\]\((https:\/\/[^\s)]+|\/[^\s)]*)\)/g,
      (_m, label: string, href: string) => `<a href="${href}">${label}</a>`,
    )
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
}

/**
 * Every dash a reader could see. CLAUDE.md forbids them in user facing copy,
 * ranges included. Checked here on the markdown source rather than in issue.ts
 * on the rendered HTML, because by then the copy has become markup and the
 * error message could no longer quote the offending sentence back.
 */
const DASHES = /[-‐‑‒–—―]/

/** Syntax a piece does not support, reported rather than silently mangled. */
const UNSUPPORTED: { pattern: RegExp; name: string }[] = [
  { pattern: /^\s*#/m, name: 'headings, since the section already has one' },
  { pattern: /^\s*\|.*\|\s*$/m, name: 'tables' },
  { pattern: /^\s*```/m, name: 'code blocks' },
  { pattern: /^\s*>/m, name: 'block quotes' },
  { pattern: /^\s*!\[/m, name: 'inline images, use the frontmatter image' },
]

export function findUnsupported(markdown: string): string[] {
  return UNSUPPORTED.filter(({ pattern }) => pattern.test(markdown)).map(({ name }) => name)
}

export function countWords(markdown: string): number {
  return markdown
    .replace(/^[-*]\s+/gm, '')
    .split(/\s+/)
    .filter(Boolean).length
}

export function readMinutes(markdown: string): number {
  return Math.max(1, Math.round(countWords(markdown) / WORDS_PER_MINUTE))
}

/** Paragraphs, and unordered lists where present. */
export function renderBody(markdown: string): string {
  const blocks: string[] = []
  let items: string[] = []

  const flush = () => {
    if (items.length === 0) return
    blocks.push(`<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`)
    items = []
  }

  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (line === '') {
      flush()
      continue
    }
    const escaped = escapeHtml(line)
    const list = /^[-*]\s+(.*)$/.exec(escaped)
    if (list) {
      items.push(renderInline(list[1]))
      continue
    }
    flush()
    blocks.push(`<p>${renderInline(escaped)}</p>`)
  }
  flush()
  return blocks.join('')
}

export function splitFrontmatter(source: string): { frontmatter: string; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source)
  if (!match) return null
  return { frontmatter: match[1], body: match[2].trim() }
}

/** Flat key and value only. A piece needs nothing a YAML parser would add. */
export function parseFrontmatter(frontmatter: string): Record<string, string> {
  const values: Record<string, string> = {}
  for (const raw of frontmatter.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([a-zA-Z][a-zA-Z0-9_]*):\s*(.*)$/.exec(line)
    if (match) values[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1')
  }
  return values
}

/**
 * Loads a piece, or every reason it cannot be used.
 *
 * Length is not judged here. The word count is returned so issue.ts can measure
 * the whole issue against the one budget that matters.
 */
export function loadPiece(
  name: string,
  source: string,
): { piece: Piece | null; problems: string[] } {
  const split = splitFrontmatter(source)
  if (!split) {
    return { piece: null, problems: [`${name}: no frontmatter block between --- fences.`] }
  }

  const values = parseFrontmatter(split.frontmatter)
  const problems: string[] = []

  if (!values.heading?.trim()) problems.push(`${name}: heading is required.`)
  if (!split.body.trim()) problems.push(`${name}: has no body.`)

  if (values.image && !/^(\/newsletter\/[\w.-]+|https:\/\/\S+)$/.test(values.image)) {
    problems.push(`${name}: image must be a path under /newsletter/ or an absolute https URL.`)
  }
  if (values.image && !values.imageAlt?.trim()) {
    problems.push(`${name}: imageAlt is required when an image is set.`)
  }

  const unsupported = findUnsupported(split.body)
  if (unsupported.length > 0) {
    problems.push(`${name}: uses unsupported markdown: ${unsupported.join(', ')}.`)
  }

  for (const [field, value] of [['heading', values.heading ?? ''], ['body', split.body]]) {
    if (DASHES.test(value)) {
      problems.push(
        `${name}: ${field} contains a dash. Copy conventions forbid dashes in user facing copy, ranges spelled out instead.`,
      )
    }
  }

  if (problems.length > 0) return { piece: null, problems }

  const words = countWords(split.body)

  return {
    piece: {
      heading: values.heading,
      html: renderBody(split.body),
      readMinutes: readMinutes(split.body),
      wordCount: words,
      image: values.image ? { url: values.image, alt: values.imageAlt } : undefined,
    },
    problems: [],
  }
}
