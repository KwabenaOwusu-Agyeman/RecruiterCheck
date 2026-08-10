// Explainable, multi-signal confidence — never a single opaque heuristic.
// The job description is REQUIRED: no combination of other signals can
// compensate for a missing/too-short description.

export const MIN_DESCRIPTION_CHARS = 200
const ACCEPT_THRESHOLD = 0.65

export interface ConfidenceInput {
  descriptionLength: number
  hasTitle: boolean
  hasCompany: boolean
  fromJsonLd: boolean
  fromKnownContainer: boolean
}

export interface ConfidenceResult {
  score: number
  signals: string[]
  accepted: boolean
}

export function scoreConfidence(input: ConfidenceInput): ConfidenceResult {
  const signals: string[] = []
  let score = 0

  if (input.descriptionLength < MIN_DESCRIPTION_CHARS) {
    return { score: 0, signals: ['description_too_short'], accepted: false }
  }

  score += 0.5
  signals.push('substantial_description')

  if (input.hasTitle) {
    score += 0.15
    signals.push('title_detected')
  }
  if (input.hasCompany) {
    score += 0.15
    signals.push('company_detected')
  }
  if (input.fromJsonLd) {
    score += 0.2
    signals.push('json_ld_job_posting')
  }
  if (input.fromKnownContainer) {
    score += 0.15
    signals.push('known_description_container')
  }

  score = Math.min(score, 1)
  return { score, signals, accepted: score >= ACCEPT_THRESHOLD }
}
