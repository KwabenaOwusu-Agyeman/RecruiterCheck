/**
 * Builds the published content index at build time.
 *
 * SERVER SIDE ONLY. Nothing reachable from a client component may import this
 * module: the glob below inlines every content file into whichever bundle
 * imports it, and the client has no need of them. A route component receives
 * its item from JSON embedded in the prerendered HTML, or fetches
 * /content-data/<slug>.json on a client side navigation.
 *
 * The glob is what makes routes dynamic. Adding a published markdown file adds
 * a route, a prerendered page and a sitemap entry, with no list to maintain
 * and no developer step.
 */
import { findCollectionProblems, parseContentFile } from './parse.ts'
import { pathFor, type ContentItem } from './schema.ts'

const SOURCES = {
  ...import.meta.glob('/content/resources/*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('/content/issues/*.md', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

export interface ContentIndex {
  /** Published, indexable or not. Routing and prerendering use this. */
  items: ContentItem[]
  /** Everything wrong with the content directory. Non empty means fail the build. */
  problems: string[]
  /** Files parsed but not published, for reporting only. */
  unpublished: number
}

let cached: ContentIndex | null = null

export function contentIndex(): ContentIndex {
  if (cached) return cached

  const items: ContentItem[] = []
  const problems: string[] = []
  let unpublished = 0

  for (const [sourcePath, source] of Object.entries(SOURCES)) {
    const { item, problems: fileProblems } = parseContentFile(sourcePath, source)
    problems.push(...fileProblems)
    if (!item) continue
    // A draft is parsed and validated, so mistakes surface before publication,
    // but it never enters the index and therefore never becomes a page.
    if (item.status !== 'published') {
      unpublished += 1
      continue
    }
    items.push(item)
  }

  problems.push(...findCollectionProblems(items))
  items.sort((a, b) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0))

  cached = { items, problems, unpublished }
  return cached
}

/** Site relative paths of every published item, for the prerender route list. */
export function publishedRoutes(): string[] {
  return contentIndex().items.map(pathFor)
}

/** One published item by its site relative path, or null. */
export function itemByPath(path: string): ContentItem | null {
  return contentIndex().items.find((item) => pathFor(item) === path) ?? null
}
