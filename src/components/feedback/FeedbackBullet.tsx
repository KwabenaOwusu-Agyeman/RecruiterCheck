import { cn } from '@/utils/cn'

// On light grounds the base success/warning fills measure 3.4:1 and 2.2:1
// as text, below AA — the deep partners hold the same hue at 5+:1. Dark
// grounds keep the brighter values, which already clear AA on navy and ink.
export function getVerdictColor(score: number, tone: 'light' | 'dark' = 'light'): string {
  if (score >= 85) return tone === 'dark' ? 'text-success' : 'text-success-deep'
  if (score >= 61) return tone === 'dark' ? 'text-warning' : 'text-warning-deep'
  return tone === 'dark' ? 'text-error-light' : 'text-error'
}

/**
 * Strengths and areas to improve are written server side as a short
 * finding/action, then evidence, then (for some areas to improve) a
 * trailing " Example: ..." clause. This pulls the example out first, then
 * splits the remaining text on the first sentence boundary so the finding
 * can render bold, the evidence as normal text, and the example as its own
 * visually separated line (the Tell -> Show structure). Decimal points
 * (e.g. "7.2%") are protected first so a stat never gets mistaken for a
 * sentence break.
 */
export function splitFinding(text: string): { title: string; evidence: string; example: string } {
  const DECIMAL_MARK = '@@DECIMAL@@'
  const protectedText = text.replace(/(\d)\.(\d)/g, `$1${DECIMAL_MARK}$2`)
  const restore = (value: string) => value.split(DECIMAL_MARK).join('.')

  const exampleMatch = protectedText.match(/^([\s\S]*?)\s*Example:\s*([\s\S]*)$/)
  const mainText = exampleMatch ? exampleMatch[1] : protectedText
  const example = exampleMatch ? restore(exampleMatch[2].trim()) : ''

  const match = mainText.match(/^([^.!?]+[.!?])\s*([\s\S]*)$/)
  if (!match) return { title: restore(mainText.trim()), evidence: '', example }
  return { title: restore(match[1].trim()), evidence: restore(match[2].trim()), example }
}

export function FeedbackBullet({
  text,
  tone = 'light',
  compact = false,
}: {
  text: string
  tone?: 'light' | 'dark'
  /**
   * Phone-only trim for landing previews: clamps the finding to three lines
   * and drops the italic Example line below sm, so a stacked card reads in
   * seconds instead of scrolling like a report. Real feedback pages never
   * pass this — a paying user's own report is not preview content.
   */
  compact?: boolean
}) {
  const { title, evidence, example } = splitFinding(text)
  const isDark = tone === 'dark'
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
        {example ? (
          <span
            className={cn(
              'mt-1 italic',
              compact ? 'hidden sm:block' : 'block',
              isDark ? 'text-blue-light/90' : 'text-blue',
            )}
          >
            Example: &quot;{example}&quot;
          </span>
        ) : null}
      </span>
    </li>
  )
}
