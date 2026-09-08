// The verdict colour for a score.
//
// Its own file so FeedbackBullet.tsx exports only a component: a module that
// mixes components with plain functions loses React Fast Refresh, which is what
// react-refresh/only-export-components warns about.
//
// The 85 and 61 thresholds are the same bands as getScoreTier in scoreTier.ts.
// They are deliberately not shared: this returns a Tailwind class and that
// returns a tier name, and coupling them would make a colour change able to
// move a verdict band. If a band ever moves, both must move together.

// On light grounds the base success/warning fills measure 3.4:1 and 2.2:1
// as text, below AA — the deep partners hold the same hue at 5+:1. Dark
// grounds keep the brighter values, which already clear AA on navy and ink.
export function getVerdictColor(score: number, tone: 'light' | 'dark' = 'light'): string {
  if (score >= 85) return tone === 'dark' ? 'text-success' : 'text-success-deep'
  if (score >= 61) return tone === 'dark' ? 'text-warning' : 'text-warning-deep'
  return tone === 'dark' ? 'text-error-light' : 'text-error'
}
