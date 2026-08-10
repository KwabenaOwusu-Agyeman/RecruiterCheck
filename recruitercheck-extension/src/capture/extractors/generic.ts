import { cleanText, NOISE_SELECTORS } from '@/capture/detect'
import { extractJobPostingJsonLd } from '@/capture/jsonld'
import type { SiteExtraction } from '@/capture/extractors/linkedin'

const CONTAINER_SELECTORS = [
  'main',
  'article',
  '[role="main"]',
  '[class*="job-description" i]',
  '[class*="jobdescription" i]',
  '[id*="job-description" i]',
  '[class*="posting-description" i]',
]

const TITLE_SELECTOR = 'h1'

function isNoise(el: Element): boolean {
  return NOISE_SELECTORS.some((noise) => el.closest(noise))
}

// Priority: (1) JSON-LD JobPosting — strongest, least fragile signal;
// (2) known/semantic job-description containers; (3) the largest plausible
// content block on the page, still excluding nav/footer/ads/related-jobs.
// Never falls back to document.body.innerText, which would sweep in
// navigation, unrelated listings, and page chrome.
export function extractGeneric(doc: Document): SiteExtraction {
  const jsonLd = extractJobPostingJsonLd(doc)
  if (jsonLd?.description) {
    return {
      title: jsonLd.title,
      companyName: jsonLd.companyName,
      description: jsonLd.description,
      fromJsonLd: true,
      fromKnownContainer: false,
    }
  }

  let best: { text: string; matchedNamedContainer: boolean } | null = null

  for (const selector of CONTAINER_SELECTORS) {
    for (const el of Array.from(doc.querySelectorAll(selector))) {
      if (isNoise(el)) continue
      const text = cleanText(el.textContent ?? '')
      if (text.length < 50) continue
      if (!best || text.length > best.text.length) {
        best = { text, matchedNamedContainer: selector !== 'main' && selector !== '[role="main"]' }
      }
    }
  }

  const title = doc.querySelector(TITLE_SELECTOR)
  const titleText = title && !isNoise(title) ? cleanText(title.textContent ?? '') : null

  const ogSite = doc.querySelector('meta[property="og:site_name"]')
  const companyName = ogSite ? cleanText(ogSite.getAttribute('content') ?? '') || null : null

  return {
    title: titleText || null,
    companyName,
    description: best?.text ?? null,
    fromJsonLd: false,
    fromKnownContainer: best?.matchedNamedContainer ?? false,
  }
}
