import { cleanText, queryText } from '@/capture/detect'
import { extractJobPostingJsonLd } from '@/capture/jsonld'
import type { SiteExtraction } from '@/capture/extractors/linkedin'

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
