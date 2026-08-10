import { detectSourceDomain } from '@/capture/detect'
import { extractLinkedIn } from '@/capture/extractors/linkedin'
import { extractIndeed } from '@/capture/extractors/indeed'
import { extractGeneric } from '@/capture/extractors/generic'
import { scoreConfidence } from '@/capture/confidence'
import type { CaptureResult } from '@/shared/types'

// Pure function of (hostname, document, url) — no chrome.* APIs, so this
// whole module is portable to any WebExtension-compatible browser and is
// unit-testable without a browser extension harness at all.
export function captureJobFromPage(hostname: string, doc: Document, url: string): CaptureResult {
  const sourceDomain = detectSourceDomain(hostname)

  const site =
    sourceDomain === 'linkedin'
      ? extractLinkedIn(doc)
      : sourceDomain === 'indeed'
        ? extractIndeed(doc)
        : extractGeneric(doc)

  // LinkedIn/Indeed selectors can go stale (site redesign); if the
  // dedicated extractor came back empty, retry with the generic heuristic
  // before giving up, per "if known selectors fail, attempt safe generic
  // extraction."
  const result =
    site.description || sourceDomain === 'other' ? site : extractGeneric(doc)

  const descriptionLength = result.description?.length ?? 0

  const confidence = scoreConfidence({
    descriptionLength,
    hasTitle: Boolean(result.title),
    hasCompany: Boolean(result.companyName),
    fromJsonLd: result.fromJsonLd,
    fromKnownContainer: result.fromKnownContainer,
  })

  if (!confidence.accepted || !result.description) {
    return {
      ok: false,
      failure: { reason: descriptionLength === 0 ? 'no_description' : 'low_confidence' },
    }
  }

  return {
    ok: true,
    capture: {
      jobTitle: result.title,
      companyName: result.companyName,
      jobDescription: result.description,
      jobUrl: url,
      sourceDomain,
      confidence: confidence.score,
    },
  }
}
