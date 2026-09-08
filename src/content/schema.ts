/**
 * The one publishing model, shared by every editorial content type.
 *
 * Newsletter issues, resource articles and future guides differ in their URL
 * namespace and their page layout, and in nothing else. Everything routing,
 * metadata, structured data and the sitemap need lives in the fields below,
 * so a new content type is a new `type` value rather than a second system.
 *
 * Strategy does NOT live here. Clusters, search intent, priority,
 * cannibalization and consolidation decisions are owned by the Content
 * Authority Map in Notion HQ. The only thing shared with it is the cluster
 * vocabulary, which is validated so the two cannot drift silently.
 */

/** Cluster vocabulary, matching the Content Authority Map. */
export const CLUSTERS = [
  'recruiter-evaluation',
  'job-descriptions',
  'ai-jobs',
  'data-jobs',
  'tech-jobs',
  'cvs',
  'job-applications',
] as const
export type Cluster = (typeof CLUSTERS)[number]

export const CONTENT_TYPES = ['article', 'guide', 'newsletter'] as const
export type ContentType = (typeof CONTENT_TYPES)[number]

/**
 * Only `published` reaches the index, and the index is what routing,
 * prerendering and the sitemap read. A draft therefore has no route, no
 * prerendered file and no sitemap entry: it cannot be accidentally indexed
 * because it does not exist as a page.
 */
export const STATUSES = ['draft', 'review', 'published'] as const
export type Status = (typeof STATUSES)[number]

/**
 * URL namespace per type. Locked decision: `/resources/` is the shared home
 * for evergreen editorial content, `/newsletter/` stays distinct for issues.
 * Editorial content never uses a flat URL, so it can never occupy or shadow
 * an existing page's path.
 */
export const BASE_PATH: Record<ContentType, string> = {
  article: '/resources',
  guide: '/resources',
  newsletter: '/newsletter',
}

/**
 * Slugs already claimed by a hand built route under the same base path.
 * `/newsletter/unsubscribe` is a live route; a content file claiming that
 * slug would shadow a working page, so the build refuses it rather than
 * letting route order decide.
 */
export const RESERVED_SLUGS: Record<string, string[]> = {
  '/resources': [],
  '/newsletter': ['unsubscribe'],
}

export interface ContentItem {
  type: ContentType
  slug: string
  title: string
  description: string
  /** ISO date. Never inferred and never invented: absent means the build fails. */
  published: string
  /** ISO date. Drives sitemap lastmod and Article dateModified. */
  updated?: string
  status: Status
  cluster: Cluster
  /** Existing page paths this item supports, rendered as internal links. */
  supports: string[]
  image?: string
  imageAlt?: string
  /** Excluded from the sitemap and marked noindex. Default false. */
  noindex: boolean
  /** Override. Omitted by default, so every item is self canonical. */
  canonical?: string
  /** Rendered body HTML. */
  html: string
  readMinutes: number
  wordCount: number
  /** Source file, for error messages only. */
  sourcePath: string
}

/** The site relative URL for an item. */
export function pathFor(item: Pick<ContentItem, 'type' | 'slug'>): string {
  return `${BASE_PATH[item.type]}/${item.slug}`
}

/** A slug is lowercase, digits and single hyphens. Hyphens in a URL are fine: the copy rule is about prose. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** ISO calendar date, no time. Anything else is a mistake worth failing on. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function isValidDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
