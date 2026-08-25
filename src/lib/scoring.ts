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
