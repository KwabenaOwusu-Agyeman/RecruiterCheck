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

/**
 * The part of a source a reader actually reads, which is what the dash rule
 * governs. Two things are markdown syntax rather than prose:
 *
 *   A leading list marker. countWords already strips it for the same reason.
 *   Without this the format documents unordered lists as supported while the
 *   dash rule rejects every one of them.
 *
 *   A link target. Every internal URL on this site is hyphenated, so checking
 *   the raw source makes [any link](/free-cv-checker) impossible while the
 *   renderer happily supports it. The label is kept and still checked.
 *
 * Both were latent: no piece had yet used a list or a link.
 */
function prose(markdown: string): string {
  return markdown
    .replace(/^[ \t]*[-*][ \t]+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
}

/**
 * Exported so other user facing copy, such as a resource article, is checked
 * against the same character class rather than a second copy of it that could
 * drift. The rule is CLAUDE.md's: no dashes in user facing copy, ranges
 * spelled out instead.
 */
export function containsDash(value: string): boolean {
  return DASHES.test(prose(value))
}

/**
 * Opt in extensions to the piece format.
 *
 * A newsletter piece is one section of an issue and deliberately forbids
 * headings, because the section already carries one. A resource article is a
 * whole page and needs its own structure. Rather than fork the renderer and
 * duplicate the escaping, the extra syntax is a flag that defaults to off, so
 * every existing caller behaves exactly as it did before this existed.
 */
export interface RenderOptions {
  /** Allow `##` and `###`. A single `#` stays unsupported: the page has an h1. */
  headings?: boolean
}

/** Syntax a piece does not support, reported rather than silently mangled. */
const UNSUPPORTED: { pattern: RegExp; name: string }[] = [
  { pattern: /^\s*#/m, name: 'headings, since the section already has one' },
  { pattern: /^\s*\|.*\|\s*$/m, name: 'tables' },
  { pattern: /^\s*```/m, name: 'code blocks' },
  { pattern: /^\s*>/m, name: 'block quotes' },
  { pattern: /^\s*!\[/m, name: 'inline images, use the frontmatter image' },
]

/** Same list, but `##` and `###` are allowed and a lone `#` still is not. */
const UNSUPPORTED_WITH_HEADINGS: { pattern: RegExp; name: string }[] = [
  { pattern: /^\s*#(?!#)/m, name: 'a top level heading, since the page already has one' },
  ...UNSUPPORTED.slice(1),
]

export function findUnsupported(markdown: string, options: RenderOptions = {}): string[] {
  const rules = options.headings ? UNSUPPORTED_WITH_HEADINGS : UNSUPPORTED
  return rules.filter(({ pattern }) => pattern.test(markdown)).map(({ name }) => name)
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

/** Paragraphs, unordered lists, and headings when they are enabled. */
export function renderBody(markdown: string, options: RenderOptions = {}): string {
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
    if (options.headings) {
      // Escaped first, so a heading cannot smuggle markup in through its text.
      const heading = /^(#{2,3})\s+(.*)$/.exec(escaped)
      if (heading) {
        flush()
        const level = heading[1].length
        blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`)
        continue
      }
    }
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
    if (containsDash(value)) {
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
