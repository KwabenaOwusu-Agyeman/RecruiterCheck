import { useEffect } from 'react'
import { BRAND } from '@/lib/constants'

const SITE_URL = BRAND.canonicalUrl

interface PageMetaOptions {
  title: string
  description: string
  path: string
}

/**
 * Populated synchronously during server-side renderToString (there is no
 * DOM to write into on the server, and effects never run there) so the
 * prerender script can read back the title/description/canonical that a
 * page actually rendered with and bake them into the static HTML head.
 */
let ssrMeta: { title: string; description: string; url: string } | null = null

export function resetSsrMeta() {
  ssrMeta = null
}

export function getSsrMeta() {
  return ssrMeta
}

function setMetaTag(selector: string, attr: string, value: string) {
  let el = document.head.querySelector<HTMLElement>(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    if (selector.includes('rel="canonical"')) el.setAttribute('rel', 'canonical')
    if (selector.includes('property=')) {
      const match = selector.match(/property="([^"]+)"/)
      if (match) el.setAttribute('property', match[1])
    }
    if (selector.includes('name=') && !selector.includes('property=')) {
      const match = selector.match(/name="([^"]+)"/)
      if (match) el.setAttribute('name', match[1])
    }
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

/**
 * Sets per-page title/description/canonical/OG tags on mount and restores
 * the site-wide defaults on unmount. No head-management library exists in
 * this project, and the app is a client-rendered SPA with a handful of
 * public routes, so a tiny effect-based hook covers it without a new
 * dependency.
 */
export function usePageMeta({ title, description, path }: PageMetaOptions) {
  const url = `${SITE_URL}${path}`

  if (typeof document === 'undefined') {
    ssrMeta = { title, description, url }
  }

  useEffect(() => {
    const previousTitle = document.title

    document.title = title
    setMetaTag('meta[name="description"]', 'content', description)
    setMetaTag('link[rel="canonical"]', 'href', url)
    setMetaTag('meta[property="og:title"]', 'content', title)
    setMetaTag('meta[property="og:description"]', 'content', description)
    setMetaTag('meta[property="og:url"]', 'content', url)

    return () => {
      document.title = previousTitle
    }
  }, [title, description, url])
}
