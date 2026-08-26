/**
 * Turns whatever the database/API actually handed back for a score into a
 * safe, finite integer in [0, 100], or null if it can't be trusted at all
 * (missing, still processing, or a malformed/legacy shape). Deliberately
 * strict: only a genuine `number` primitive is accepted — a numeric string,
 * array, object, NaN, or out of range value all fall back to null rather
 * than being coerced, since a coercion here is exactly the kind of silent
 * "looks fine, isn't" bug that produced the garbled percentage display.
 * Every score render must go through this before reaching the DOM.
 */
export function sanitizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return 'Likely Interview Candidate'
  if (score >= 61) return 'Needs Improvement'
  return 'Not a Fit'
}

export type ResultTone = 'light' | 'dark' | 'muted'

/**
 * Maps a check's score to the card tone the result should render in:
 * white for a likely interview candidate, navy while there's real work to
 * do, muted grey when the role isn't a fit. A null score (check still
 * processing) defaults to navy, the tone used before a score exists.
 */
export function getResultTone(score: number | null): ResultTone {
  if (score === null) return 'dark'
  if (score >= 85) return 'light'
  if (score >= 61) return 'dark'
  return 'muted'
}
