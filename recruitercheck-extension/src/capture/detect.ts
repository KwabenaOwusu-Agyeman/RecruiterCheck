import type { SourceDomain } from '@/shared/types'

export function detectSourceDomain(hostname: string): SourceDomain {
  const host = hostname.toLowerCase()
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin'
  if (/(^|\.)indeed\.com$/.test(host)) return 'indeed'
  return 'other'
}

// Elements/subtrees that are never part of a job description, regardless of
// which extractor is running — excluded before any text is read from them.
export const NOISE_SELECTORS = [
  'nav',
  'header',
  'footer',
  'aside',
  'script',
  'style',
  'noscript',
  'form',
  'iframe',
  '[class*="cookie" i]',
  '[class*="consent" i]',
  '[class*="advertisement" i]',
  '[class*="related-job" i]',
  '[class*="recommended-job" i]',
  '[class*="similar-job" i]',
  '[id*="cookie" i]',
]

export function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim()
}

// `.textContent` includes any descendant <style>/<script> text verbatim —
// seen on Indeed's job-description container, which embeds component CSS
// inline. Clones the node first so the live DOM is never mutated.
export function textExcludingTags(el: Element, tags: string[]): string {
  const clone = el.cloneNode(true) as Element
  for (const tag of tags) {
    clone.querySelectorAll(tag).forEach((node) => node.remove())
  }
  return cleanText(clone.textContent ?? '')
}

// Reads textContent from the first matching selector, skipping any node
// nested inside a noise selector.
export function queryText(root: ParentNode, selectors: string[]): string | null {
  for (const selector of selectors) {
    const el = root.querySelector(selector)
    if (!el) continue
    if (NOISE_SELECTORS.some((noise) => el.closest(noise))) continue
    const text = cleanText(el.textContent ?? '')
    if (text) return text
  }
  return null
}
