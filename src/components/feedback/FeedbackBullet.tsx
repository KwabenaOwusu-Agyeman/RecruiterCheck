import { cn } from '@/utils/cn'
import { SAMPLE_WORDING_LABEL, splitFinding } from '@/lib/feedbackText'

// On light grounds the base success/warning fills measure 3.4:1 and 2.2:1
// as text, below AA — the deep partners hold the same hue at 5+:1. Dark
// grounds keep the brighter values, which already clear AA on navy and ink.
export function getVerdictColor(score: number, tone: 'light' | 'dark' = 'light'): string {
  if (score >= 85) return tone === 'dark' ? 'text-success' : 'text-success-deep'
  if (score >= 61) return tone === 'dark' ? 'text-warning' : 'text-warning-deep'
  return tone === 'dark' ? 'text-error-light' : 'text-error'
}

/**
 * One strength or area to improve. The stored string is split (see
 * src/lib/feedbackText.ts) into a bold finding, plain evidence, and an
 * optional trailing line: "Sample wording" (a complete fictional CV bullet,
 * checks generated under prompt v6 and later) or the historical "Example"
 * clause. Both render on their own line under the evidence so the card
 * layout is identical for old and new checks.
 */
export function FeedbackBullet({
  text,
  tone = 'light',
  compact = false,
}: {
  text: string
  tone?: 'light' | 'dark'
  /**
   * Phone-only trim for landing previews: clamps the finding to three lines
   * and drops the sample wording or example line below sm, so a stacked
   * card reads in seconds instead of scrolling like a report. Real feedback
   * pages never pass this — a paying user's own report is not preview
   * content.
   */
  compact?: boolean
}) {
  const { title, evidence, example, sampleWording } = splitFinding(text)
  const isDark = tone === 'dark'
  const clauseClass = cn('mt-1', compact ? 'hidden sm:block' : 'block', isDark ? 'text-blue-light/90' : 'text-blue')
  return (
    <li className="flex gap-2">
      <span className={isDark ? 'text-blue-light' : 'text-blue'} aria-hidden="true">
        •
      </span>
      <span
        className={cn(
          'text-sm leading-snug',
          compact && 'line-clamp-3 sm:line-clamp-none',
          isDark ? 'text-white/85' : 'text-text-secondary',
        )}
      >
        <span className={cn('font-semibold', isDark ? 'text-white' : 'text-text-primary')}>{title}</span>
        {evidence ? ` ${evidence}` : null}
        {sampleWording ? (
          <span className={clauseClass}>
            <span className="font-semibold">{SAMPLE_WORDING_LABEL}:</span>{' '}
            <span className="italic">&quot;{sampleWording}&quot;</span>
          </span>
        ) : example ? (
          <span className={cn(clauseClass, 'italic')}>
            Example: &quot;{example}&quot;
          </span>
        ) : null}
      </span>
    </li>
  )
}
