import { cn } from '@/utils/cn'

/**
 * The Interview Score lockup: the one way a score is presented anywhere it
 * appears at product size. Fixed vertical order — Fraunces numeral with the
 * "Interview Score" label on its baseline, verdict pill, tier-coloured
 * gauge, then optionally the weighted framework — so the same object recurs
 * at hero, trio and step-mock size until a cropped screenshot of any of
 * them is recognisably MyRecruiterCheck.
 *
 * Two deliberate identity rules live here and nowhere else:
 * - The percentage is set in Fraunces. Display-face numerals are reserved
 *   for the Interview Score; every other number on the site stays in Inter.
 * - The gauge is the SCORE as a picture (one fill, one tier colour). The
 *   40/35/25 scoring weights are never drawn as bar segments, because a
 *   segmented bar reads as "you scored 40 on Experience" — the weights are
 *   properties of the model, not of the candidate, and appear only as the
 *   labelled "Scoring weights" row below.
 *
 * Currently used by the landing surfaces (hero preview, verdict trio, How
 * it works mock). The real FeedbackPage still renders its own score header
 * (its width comes from live data, which needs the SVG-attribute technique
 * under this CSP); fold it onto this component when that page is next
 * touched, not before.
 */

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

/**
 * The three dimensions of the real scoring model, with their weights. Shown
 * only under the explicit "Scoring weights" label so a first-time visitor
 * cannot read them as the candidate's own sub-scores.
 */
export const SCORING_WEIGHTS = [
  { label: 'Experience', weight: '40%' },
  { label: 'Required skills', weight: '35%' },
  { label: 'Candidate value', weight: '25%' },
] as const

// The pill always pairs a dot with the written verdict — the tier is never
// colour alone. Light grounds use the text-safe deep tokens; dark grounds
// keep the brighter fills, which already clear AA on navy and ink.
const PILL_TONE: Record<'light' | 'dark', Record<ScoreTier, string>> = {
  light: {
    likely: 'bg-success/10 text-success-deep',
    improve: 'bg-warning/15 text-warning-deep',
    'not-a-fit': 'bg-error/10 text-error',
  },
  dark: {
    likely: 'bg-white/10 text-success',
    improve: 'bg-white/10 text-warning',
    'not-a-fit': 'bg-white/10 text-error-light',
  },
}

const BAR_FILL: Record<'light' | 'dark', Record<ScoreTier, string>> = {
  light: {
    likely: 'bg-success',
    improve: 'bg-warning',
    'not-a-fit': 'bg-error',
  },
  dark: {
    likely: 'bg-success',
    improve: 'bg-warning',
    'not-a-fit': 'bg-error-light',
  },
}

interface ScoreLockupProps {
  score: number
  /**
   * Literal Tailwind width class for the gauge fill (e.g. 'w-[76%]') —
   * literal because Tailwind's build-time scanner only generates classes it
   * can see written out. See ROLE_EXAMPLES.
   */
  scoreWidthClass: string
  tone?: 'light' | 'dark'
  /** 'lg' is the full lockup; 'sm' is the miniature (numeral, label, gauge). */
  size?: 'lg' | 'sm'
  /** Adds the labelled weighted-framework row under the gauge. */
  showFramework?: boolean
  /** Keying the fill replays the sweep when the example changes. */
  animationKey?: string
  className?: string
}

export function ScoreLockup({
  score,
  scoreWidthClass,
  tone = 'light',
  size = 'lg',
  showFramework = false,
  animationKey,
  className,
}: ScoreLockupProps) {
  const tier = getScoreTier(score)
  const isDark = tone === 'dark'

  return (
    <div className={className}>
      <p className={cn('flex items-baseline', size === 'lg' ? 'gap-[10px]' : 'gap-[8px]')}>
        <span
          className={cn(
            'font-display font-semibold leading-none tracking-[-0.02em] [font-variant-numeric:tabular-nums]',
            size === 'lg' ? 'text-[40px] sm:text-[44px]' : 'text-[20px]',
            isDark ? 'text-white' : 'text-text-primary',
          )}
        >
          {score}%
        </span>
        <span
          className={cn(
            'font-semibold uppercase',
            size === 'lg' ? 'text-[12px] tracking-[0.14em]' : 'text-[10px] tracking-[0.12em]',
            isDark ? 'text-white/65' : 'text-text-caption',
          )}
        >
          Interview Score
        </span>
      </p>

      {size === 'lg' ? (
        <p className="mt-[10px]">
          <span
            className={cn(
              'inline-flex items-center gap-[8px] rounded-full px-[12px] py-[5px] text-[13px] font-semibold leading-none',
              PILL_TONE[tone][tier],
            )}
          >
            <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-current" aria-hidden="true" />
            {TIER_LABEL[tier]}
          </span>
        </p>
      ) : null}

      <div
        className={cn(
          'h-[6px] w-full overflow-hidden rounded-full',
          size === 'lg' ? 'mt-[14px]' : 'mt-[8px]',
          isDark ? 'bg-white/15' : 'bg-border-soft',
        )}
        aria-hidden="true"
      >
        <div
          key={animationKey}
          className={cn(
            'h-full origin-left animate-grow-bar rounded-full',
            scoreWidthClass,
            BAR_FILL[tone][tier],
          )}
        />
      </div>

      {showFramework ? (
        <div className={cn('mt-[16px] border-t pt-[14px]', isDark ? 'border-white/10' : 'border-border')}>
          <p
            className={cn(
              'text-[10px] font-semibold uppercase tracking-[0.14em]',
              isDark ? 'text-white/50' : 'text-text-caption',
            )}
          >
            Scoring weights
          </p>
          <dl className="mt-[8px] grid grid-cols-3 gap-[8px]">
            {SCORING_WEIGHTS.map((dimension) => (
              <div key={dimension.label}>
                <dt
                  className={cn(
                    'text-[13px] font-medium leading-snug',
                    isDark ? 'text-white/85' : 'text-text-primary',
                  )}
                >
                  {dimension.label}
                </dt>
                <dd
                  className={cn(
                    'mt-[2px] text-xs [font-variant-numeric:tabular-nums]',
                    isDark ? 'text-white/55' : 'text-text-secondary',
                  )}
                >
                  {dimension.weight}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
