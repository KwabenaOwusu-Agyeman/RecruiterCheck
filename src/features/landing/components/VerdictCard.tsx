import { Card, CardContent } from '@/components/ui/Card'
import { FeedbackBullet, getVerdictColor } from '@/components/feedback/FeedbackBullet'
import { type RoleExample, type RoleExampleTier } from '@/features/landing/data/exampleCheck'
import { cn } from '@/utils/cn'

const TIER_LABEL: Record<RoleExampleTier, string> = {
  likely: 'Likely Interview Candidate',
  improve: 'Needs Improvement',
  'not-a-fit': 'Not a Fit',
}

const TEXT_TONE: Record<'light' | 'dark' | 'muted', 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  muted: 'light',
}

const TIER_BAR: Record<RoleExampleTier, string> = {
  likely: 'bg-success',
  improve: 'bg-warning',
  'not-a-fit': 'bg-error-light',
}

interface VerdictCardProps {
  example: RoleExample
  /** Card ground. The tier sections use dark/muted to show the range of outcomes. */
  tone?: 'light' | 'dark' | 'muted'
  /** One strength and one improvement instead of the full lists. */
  compact?: boolean
  /** Force a single column (for side-by-side tier cards); default is 2 columns from lg up. */
  stacked?: boolean
  /**
   * Drop the card shell entirely (no border, radius or shadow) for use
   * inside a frame that already provides one, like the hero's AppWindow.
   * A prop rather than className overrides, because this repo's cn() has
   * no tailwind-merge and a passed-in rounded-none cannot reliably beat
   * Card's own rounded-[20px].
   */
  frameless?: boolean
  className?: string
}

/**
 * The example check verdict — score, tier, strengths, areas to improve —
 * shared by the hero and the tier showcase so the two renderings of "what a
 * check gives you" can never drift apart. Content comes from ROLE_EXAMPLES
 * (one entry is a genuine pipeline result; see exampleCheck.ts).
 *
 * Deliberately no company line anywhere: the employers in the example data
 * are invented, which is fine four sections down under an "Example result"
 * badge but not as some of the most prominent words on the site. Role and
 * experience level are what answer "is this for me?" anyway.
 */
export function VerdictCard({ example, tone = 'light', compact = false, stacked = false, frameless = false, className }: VerdictCardProps) {
  const textTone = TEXT_TONE[tone]
  const isDarkText = textTone === 'dark'
  const strengths = compact ? example.strengths.slice(0, 1) : example.strengths
  const improvements = compact ? example.improvements.slice(0, 1) : example.improvements

  const Shell = frameless ? 'div' : undefined

  return Shell ? (
    <Shell className={cn('relative overflow-hidden bg-surface text-left', className)}>
      <VerdictCardBody />
    </Shell>
  ) : (
    <Card tone={tone} className={cn('relative overflow-hidden text-left', className)}>
      <VerdictCardBody />
    </Card>
  )

  function VerdictCardBody() {
    return (
      <CardContent
        className={cn(
          'px-6 py-5',
          !stacked && 'lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-0 lg:p-[40px]',
        )}
      >
        <div
          className={cn(
            'flex flex-col',
            !stacked && 'lg:justify-center lg:border-r lg:pr-10',
            !stacked && (isDarkText ? 'lg:border-white/10' : 'lg:border-border'),
          )}
        >
          <span
            className={cn(
              'mb-2 inline-block w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide',
              isDarkText
                ? 'border-white/20 bg-white/10 text-white/80'
                : 'border-border-strong bg-surface/80 text-text-secondary',
            )}
          >
            Example result
          </span>
          <p className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
            {example.role}
          </p>
          <p className={cn('text-sm font-semibold', isDarkText ? 'text-blue-light' : 'text-blue')}>
            {example.experience}
          </p>

          <p
            className={cn(
              'mt-4 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl',
              isDarkText ? 'text-white' : 'text-text-primary',
            )}
          >
            {example.score}%{' '}
            <span
              className={cn(
                'text-base font-semibold sm:text-lg',
                isDarkText ? 'text-white/65' : 'text-text-secondary',
              )}
            >
              Interview Score
            </span>
          </p>
          <p className={cn('mt-1 text-base font-semibold', getVerdictColor(example.score, textTone))}>
            {TIER_LABEL[example.tier]}
          </p>

          {/* The score as a picture, not just a number. Width comes from the
              per-example literal class (see scoreWidthClass); the sweep is a
              compiled keyframe, keyed by example id so switching roles
              replays it — no inline styles, which the CSP's style-src has no
              allowance for. */}
          <div
            className={cn(
              'mt-3 h-[6px] w-full overflow-hidden rounded-full',
              isDarkText ? 'bg-white/15' : 'bg-border-soft',
            )}
            aria-hidden="true"
          >
            <div
              key={example.id}
              className={cn(
                'h-full origin-left animate-grow-bar rounded-full',
                example.scoreWidthClass,
                TIER_BAR[example.tier],
              )}
            />
          </div>
        </div>

        <div className={cn('mt-[16px] grid gap-[16px] sm:mt-5 sm:gap-5', !stacked && 'lg:mt-0 lg:pl-10')}>
          <div>
            <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
              Strengths
            </h3>
            <ul className="mt-2 space-y-3">
              {strengths.map((item) => (
                <FeedbackBullet key={item} text={item} tone={textTone} />
              ))}
            </ul>
          </div>
          <div>
            <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
              Areas to Improve
            </h3>
            <ul className="mt-2 space-y-3">
              {improvements.map((item) => (
                <FeedbackBullet key={item} text={item} tone={textTone} />
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    )
  }
}
