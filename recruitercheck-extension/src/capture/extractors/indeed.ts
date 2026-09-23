import { cleanText, queryText, textExcludingTags, NOISE_SELECTORS } from '@/capture/detect'
import { extractJobPostingJsonLd } from '@/capture/jsonld'
import type { SiteExtraction } from '@/capture/extractors/linkedin'

// Verified 2026-09-23 live: the dedicated /viewjob?jk=... page still ships a
// JobPosting JSON-LD block (handled below, first priority) and these legacy
// selectors are dead there too. Kept as a last-resort fallback.
const TITLE_SELECTORS = [
  '[data-testid="jobsearch-JobInfoHeader-title"]',
  '.jobsearch-JobInfoHeader-title',
  'h1',
]
const COMPANY_SELECTORS = [
  '[data-testid="inlineHeader-companyName"]',
  '.jobsearch-InlineCompanyRating',
]
const DESCRIPTION_SELECTORS = ['#jobDescriptionText']

// The search-results split pane (/jobs?q=...) has no JSON-LD at all, and the
// generic extractor's <main> fallback grabs the entire results page (every
// listing, ~800KB) instead of the one job in the detail pane — a silent
// wrong-answer, not a clean failure. These are the current layout's stable
// hooks there: `company-name` and `vj-job-title` are Indeed's own
// data-testid attributes, and `simple-job-description-html` is a real
// (non-hashed) class name, unlike the surrounding atomic CSS classes.
const CURRENT_TITLE_SELECTOR = '[data-testid="vj-job-title"]'
const CURRENT_COMPANY_SELECTOR = '[data-testid="company-name"]'
const CURRENT_DESCRIPTION_SELECTOR = '.simple-job-description-html'

function extractCurrentLayoutDescription(doc: Document): string | null {
  const box = doc.querySelector(CURRENT_DESCRIPTION_SELECTOR)
  if (!box || NOISE_SELECTORS.some((noise) => box.closest(noise))) return null
  // The box embeds its own <style> tags as siblings of the real content —
  // strip them so component CSS never leaks into the extracted description.
  const text = textExcludingTags(box, ['style', 'script'])
  return text || null
}

export function extractIndeed(doc: Document): SiteExtraction {
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

  const legacyDescription = queryText(doc, DESCRIPTION_SELECTORS)
  const description = extractCurrentLayoutDescription(doc) ?? (legacyDescription ? cleanText(legacyDescription) : null)

  // Current-layout selectors first: TITLE_SELECTORS' generic 'h1' fallback
  // would otherwise match the search page's own "<query> jobs in <location>"
  // heading instead of the specific job's title.
  const title = queryText(doc, [CURRENT_TITLE_SELECTOR]) ?? queryText(doc, TITLE_SELECTORS)
  const companyName = queryText(doc, [CURRENT_COMPANY_SELECTOR]) ?? queryText(doc, COMPANY_SELECTORS)

  return {
    title,
    companyName,
    description,
    fromJsonLd: false,
    fromKnownContainer: description !== null,
  }
}
