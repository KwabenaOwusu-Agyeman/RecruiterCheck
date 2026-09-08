// Score tiers and their public labels.
//
// Its own file so ScoreLockup.tsx exports only a component: a module that mixes
// components with plain values loses React Fast Refresh, which is what
// react-refresh/only-export-components warns about.
//
// The 85 and 61 thresholds are the same bands as getVerdictColor in
// verdictColor.ts. See the note there on why they are not shared.

export type ScoreTier = 'likely' | 'improve' | 'not-a-fit'

export function getScoreTier(score: number): ScoreTier {
  if (score >= 85) return 'likely'
  if (score >= 61) return 'improve'
  return 'not-a-fit'
}

export const TIER_LABEL: Record<ScoreTier, string> = {
  likely: 'Likely Interview Candidate',
  improve: 'Needs Improvement',
  'not-a-fit': 'Not a Fit',
}
