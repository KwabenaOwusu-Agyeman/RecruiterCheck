export function getScoreLabel(score: number): string {
  if (score >= 85) return 'Likely Interview Candidate'
  if (score >= 61) return 'Needs Improvement'
  return 'Not a Fit'
}
