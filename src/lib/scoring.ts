export function getScoreLabel(score: number): string {
  if (score >= 85) return 'Strong Match'
  if (score >= 50) return 'Needs Improvement'
  return 'Not a Fit'
}
