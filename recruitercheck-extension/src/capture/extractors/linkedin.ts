import { cleanText, queryText } from '@/capture/detect'
import { extractJobPostingJsonLd } from '@/capture/jsonld'

export interface SiteExtraction {
  title: string | null
  companyName: string | null
  description: string | null
  fromJsonLd: boolean
  fromKnownContainer: boolean
}

// LinkedIn ships a JobPosting JSON-LD block on both /jobs/view/<id> pages
// and the search-results detail pane in most layouts — preferred first since
// it's the most reliable, least selector-fragile signal. DOM selectors are
// a deliberately narrow, targeted fallback: only the job title/company/
// description region the user is looking at. Nothing here ever reads the
// viewer's own profile, the feed, connections, or messages — those live in
// entirely different DOM subtrees this never queries.
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

  const description = queryText(doc, DESCRIPTION_SELECTORS)
  const title = queryText(doc, TITLE_SELECTORS)
  const companyName = queryText(doc, COMPANY_SELECTORS)

  return {
    title,
    companyName,
    description: description ? cleanText(description) : null,
    fromJsonLd: false,
    fromKnownContainer: description !== null,
  }
}
