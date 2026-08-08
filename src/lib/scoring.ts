export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Ready to Apply'
  if (score >= 50) return 'Ready with Improvements'
  return 'Better Fit Role Recommended'
}
