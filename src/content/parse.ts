/**
 * Parses one content file into a ContentItem, or every reason it cannot be
 * published.
 *
 * Reuses supabase/functions/_shared/newsletter/piece.ts rather than adding a
 * markdown dependency. That parser escapes the source BEFORE producing any
 * markup, so raw HTML in a file is inert rather than sanitised and there is no
 * allowlist to get wrong. Headings are the one addition an article needs, and
 * they are opt in there, so a newsletter piece still behaves exactly as before.
 *
 * Problems are collected rather than thrown one at a time, so a build failure
 * reports everything wrong with a file in one pass.
 */
import {
  containsDash,
  countWords,
  findUnsupported,
  parseFrontmatter,
  readMinutes,
  renderBody,
  splitFrontmatter,
} from '../../supabase/functions/_shared/newsletter/piece.ts'
import {
  BASE_PATH,
  CLUSTERS,
  CONTENT_TYPES,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  STATUSES,
  isValidDate,
  type Cluster,
  type ContentItem,
  type ContentType,
  type Status,
} from './schema.ts'

const RENDER_OPTIONS = { headings: true }

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : null
}

/**
 * `supports` is a comma separated list rather than YAML sequence syntax,
 * because the shared frontmatter parser is flat key and value by design and
 * teaching it lists would be a second format to get wrong.
 */
function parseList(value: string | undefined): string[] {
  if (!value) return []
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function parseContentFile(
  sourcePath: string,
  source: string,
): { item: ContentItem | null; problems: string[] } {
  const split = splitFrontmatter(source)
  if (!split) {
    return { item: null, problems: [`${sourcePath}: no frontmatter block between --- fences.`] }
  }

  const values = parseFrontmatter(split.frontmatter)
  const problems: string[] = []
  const fail = (message: string) => problems.push(`${sourcePath}: ${message}`)

  const type = oneOf<ContentType>(values.type, CONTENT_TYPES)
  if (!type) fail(`type must be one of ${CONTENT_TYPES.join(', ')}.`)

  const status = oneOf<Status>(values.status, STATUSES)
  if (!status) fail(`status must be one of ${STATUSES.join(', ')}.`)

  const cluster = oneOf<Cluster>(values.cluster, CLUSTERS)
  if (!cluster) {
    fail(
      `cluster must be one of ${CLUSTERS.join(', ')}. The vocabulary is owned by the Content Authority Map in Notion.`,
    )
  }

  const slug = values.slug?.trim() ?? ''
  if (!slug) fail('slug is required.')
  else if (!SLUG_PATTERN.test(slug)) fail(`slug "${slug}" must be lowercase words separated by single hyphens.`)
  else if (type && RESERVED_SLUGS[BASE_PATH[type]]?.includes(slug)) {
    fail(`slug "${slug}" is reserved: ${BASE_PATH[type]}/${slug} is already a hand built route.`)
  }

  const title = values.title?.trim() ?? ''
  if (!title) fail('title is required.')

  const description = values.description?.trim() ?? ''
  if (!description) fail('description is required.')

  const published = values.published?.trim() ?? ''
  if (!published) fail('published is required. A publication date is never inferred.')
  else if (!isValidDate(published)) fail(`published "${published}" must be an ISO date, YYYY-MM-DD.`)

  const updated = values.updated?.trim()
  if (updated && !isValidDate(updated)) fail(`updated "${updated}" must be an ISO date, YYYY-MM-DD.`)
  if (updated && published && isValidDate(updated) && isValidDate(published) && updated < published) {
    fail(`updated "${updated}" is before published "${published}".`)
  }

  if (!split.body.trim()) fail('has no body.')

  if (values.image && !values.imageAlt?.trim()) fail('imageAlt is required when an image is set.')
  if (values.image && !/^(\/[\w./-]+|https:\/\/\S+)$/.test(values.image)) {
    fail('image must be a site relative path or an absolute https URL.')
  }

  if (values.noindex && !['true', 'false'].includes(values.noindex)) {
    fail(`noindex "${values.noindex}" must be true or false.`)
  }

  const unsupported = findUnsupported(split.body, RENDER_OPTIONS)
  if (unsupported.length > 0) fail(`uses unsupported markdown: ${unsupported.join(', ')}.`)

  // Title, description and body are all user facing copy.
  for (const [field, value] of [
    ['title', title],
    ['description', description],
    ['body', split.body],
  ]) {
    if (value && containsDash(value)) {
      fail(`${field} contains a dash. Copy conventions forbid dashes in user facing copy, ranges spelled out instead.`)
    }
  }

  if (problems.length > 0) return { item: null, problems }

  return {
    item: {
      type: type as ContentType,
      slug,
      title,
      description,
      published,
      updated: updated || undefined,
      status: status as Status,
      cluster: cluster as Cluster,
      supports: parseList(values.supports),
      image: values.image || undefined,
      imageAlt: values.imageAlt || undefined,
      noindex: values.noindex === 'true',
      canonical: values.canonical || undefined,
      html: renderBody(split.body, RENDER_OPTIONS),
      readMinutes: readMinutes(split.body),
      wordCount: countWords(split.body),
      sourcePath,
    },
    problems: [],
  }
}

/**
 * Collection level checks that a single file cannot make on its own.
 * Two files claiming one URL is the failure this exists to catch.
 */
export function findCollectionProblems(items: ContentItem[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>()
  for (const item of items) {
    const key = `${BASE_PATH[item.type]}/${item.slug}`
    const existing = seen.get(key)
    if (existing) problems.push(`${item.sourcePath}: slug collides with ${existing} at ${key}.`)
    else seen.set(key, item.sourcePath)
  }
  return problems
}
