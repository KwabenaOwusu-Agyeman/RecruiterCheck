/**
 * How a rendered page gets its content item, without dragging every content
 * file into the client bundle.
 *
 * Two paths, one interface:
 *
 *   Prerender. entry-server.tsx installs a provider backed by load.ts, so the
 *   server render has the item synchronously. Only the SSR bundle imports
 *   load.ts, so only the SSR bundle inlines the markdown.
 *
 *   Browser. The prerendered HTML carries the item in a JSON script tag, which
 *   the first client render reads synchronously. That keeps hydration matching
 *   the server output without shipping the content twice. A client side
 *   navigation to a page that was never prerendered falls back to fetching the
 *   same JSON the prerender wrote.
 */
import type { ContentItem } from './schema.ts'

export const EMBEDDED_ID = '__content_item__'

type Provider = (path: string) => ContentItem | null

let provider: Provider | null = null

/** Called by the server entry only. */
export function setContentProvider(fn: Provider) {
  provider = fn
}

/** The item embedded in the prerendered HTML, if this page has one. */
export function embeddedItem(): ContentItem | null {
  if (typeof document === 'undefined') return null
  const node = document.getElementById(EMBEDDED_ID)
  if (!node?.textContent) return null
  try {
    return JSON.parse(node.textContent) as ContentItem
  } catch {
    // A malformed blob is a bug, not a reason to blank the page: the fetch
    // fallback below still resolves it.
    return null
  }
}

/** Synchronous lookup. Null means the caller should fetch. */
export function itemForPath(path: string): ContentItem | null {
  if (provider) return provider(path)
  const embedded = embeddedItem()
  return embedded && contentPath(embedded) === path ? embedded : null
}

/** Where the prerender writes each item, and where a client navigation reads it. */
export function dataUrlFor(path: string): string {
  return `/content-data${path}.json`
}

function contentPath(item: ContentItem): string {
  return `${item.type === 'newsletter' ? '/newsletter' : '/resources'}/${item.slug}`
}
