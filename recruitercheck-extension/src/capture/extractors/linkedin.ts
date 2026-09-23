import { cleanText, queryText, NOISE_SELECTORS } from '@/capture/detect'
import { extractJobPostingJsonLd } from '@/capture/jsonld'

export interface SiteExtraction {
  title: string | null
  companyName: string | null
  description: string | null
  fromJsonLd: boolean
  fromKnownContainer: boolean
}

// LinkedIn ships a JobPosting JSON-LD block on both /jobs/view/<id> pages
// and the search-results detail pane in some layouts — preferred first since
// it's the most reliable, least selector-fragile signal. DOM selectors are
// a deliberately narrow, targeted fallback: only the job title/company/
// description region the user is looking at. Nothing here ever reads the
// viewer's own profile, the feed, connections, or messages — those live in
// entirely different DOM subtrees this never queries.
//
// Verified 2026-09-23 live against both page types: these class names are
// currently dead on both /jobs/view/<id> and the search-results split pane.
// LinkedIn's job detail panel now renders with per-deploy hashed CSS-module
// classes (e.g. "_0b22eed8 ff567c12 ..."), so a class selector is no longer
// a stable hook there at all. Kept as a fallback in case LinkedIn reverts
// or this varies by experiment/region.
const TITLE_SELECTORS = [
  '.job-details-jobs-unified-top-card__job-title',
  '.jobs-unified-top-card__job-title',
  'h1.t-24',
]
const COMPANY_SELECTORS = [
  '.job-details-jobs-unified-top-card__company-name',
  '.jobs-unified-top-card__company-name',
]
const DESCRIPTION_SELECTORS = ['.jobs-description__content', '#job-details', '.jobs-box__html-content']

// Current layout's only stable hooks: the "About the job" heading text
// (visible, user-facing copy) and data-testid="expandable-text-box"
// (LinkedIn's own test-automation attribute for the expandable text blocks
// used for both the job description and the "About the company" blurb).
// Picks the first such box that falls between "About the job" and
// "About the company" in document order, rather than assuming a fixed DOM
// nesting, since that nesting already differs between the two page types.
function isAfter(a: Element, b: Element): boolean {
  return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
}

function extractCurrentLayoutDescription(doc: Document): string | null {
  const headings = Array.from(doc.querySelectorAll('h1, h2, h3, [role="heading"]'))
  const aboutJobHeading = headings.find((h) => /about the job/i.test(h.textContent ?? ''))
  if (!aboutJobHeading) return null

  const aboutCompanyHeading = headings.find((h) => /about the company/i.test(h.textContent ?? ''))
  const boxes = Array.from(doc.querySelectorAll('[data-testid="expandable-text-box"]'))
  const box = boxes.find((candidate) => {
    if (!isAfter(aboutJobHeading, candidate)) return false
    if (aboutCompanyHeading && !isAfter(candidate, aboutCompanyHeading)) return false
    return true
  })
  if (!box || NOISE_SELECTORS.some((noise) => box.closest(noise))) return null

  const text = cleanText(box.textContent ?? '')
  return text || null
}

// LinkedIn keeps "<Job title> | <Company> | LinkedIn" as the page <title>
// even on the current layout — it's SEO metadata, not a styling hook, so it
// stays well-formed independent of the CSS-module experiment above.
function extractFromDocumentTitle(doc: Document): { title: string | null; companyName: string | null } {
  const parts = doc.title
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
  const lastPart = parts[parts.length - 1]
  if (parts.length >= 2 && lastPart && lastPart.toLowerCase() === 'linkedin') {
    return { title: parts[0] ?? null, companyName: parts.length >= 3 ? (parts[1] ?? null) : null }
  }
  return { title: null, companyName: null }
}

// Cross-check/fallback for company name: the link to the company's own
// LinkedIn page is a functional href, not a style hook, so it survives the
// same CSS-module churn that broke COMPANY_SELECTORS.
function extractCompanyFromLink(doc: Document): string | null {
  const link = doc.querySelector('a[href*="/company/"]')
  const text = link ? cleanText(link.textContent ?? '') : ''
  return text || null
}

export function extractLinkedIn(doc: Document): SiteExtraction {
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

  const { title: titleFromDocTitle, companyName: companyFromDocTitle } = extractFromDocumentTitle(doc)
  const title = queryText(doc, TITLE_SELECTORS) ?? titleFromDocTitle
  const companyName = queryText(doc, COMPANY_SELECTORS) ?? companyFromDocTitle ?? extractCompanyFromLink(doc)

  return {
    title,
    companyName,
    description,
    fromJsonLd: false,
    fromKnownContainer: description !== null,
  }
}
