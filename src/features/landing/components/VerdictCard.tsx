import { Card, CardContent } from '@/components/ui/Card'
import { FeedbackBullet } from '@/components/feedback/FeedbackBullet'
import { ScoreLockup } from '@/components/feedback/ScoreLockup'
import { type RoleExample } from '@/features/landing/data/exampleCheck'
import { cn } from '@/utils/cn'

const TEXT_TONE: Record<'light' | 'dark' | 'ink' | 'muted', 'light' | 'dark'> = {
  light: 'light',
  dark: 'dark',
  ink: 'dark',
  muted: 'light',
}

interface VerdictCardProps {
  example: RoleExample
  /** Card ground. The tier trio uses light/dark/ink to darken as the verdict worsens. */
  tone?: 'light' | 'dark' | 'ink' | 'muted'
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
            Example
          </span>
          <p className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
            {example.role}
          </p>
          <p className={cn('text-sm font-semibold', isDarkText ? 'text-blue-light' : 'text-blue')}>
            {example.experience}
          </p>

          {/* The shared Interview Score lockup — Fraunces numeral, verdict
              pill, tier-coloured gauge — identical to the hero preview and
              the step mock so the signature recurs instead of being
              restyled per surface. */}
          <ScoreLockup
            className="mt-4"
            score={example.score}
            scoreWidthClass={example.scoreWidthClass}
            tone={textTone}
            animationKey={example.id}
          />
        </div>

        <div className={cn('mt-[16px] grid gap-[16px] sm:mt-5 sm:gap-5', !stacked && 'lg:mt-0 lg:pl-10')}>
          <div>
            <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
              Strengths
            </h3>
            <ul className="mt-2 space-y-3">
              {strengths.map((item) => (
                <FeedbackBullet key={item} text={item} tone={textTone} compact={compact} />
              ))}
            </ul>
          </div>
          <div>
            <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
              Areas to Improve
            </h3>
            <ul className="mt-2 space-y-3">
              {improvements.map((item) => (
                <FeedbackBullet key={item} text={item} tone={textTone} compact={compact} />
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    )
  }
}
