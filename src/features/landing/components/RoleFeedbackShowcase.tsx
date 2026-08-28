import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { FeedbackBullet, getVerdictColor } from '@/components/feedback/FeedbackBullet'
import { ROLE_EXAMPLES, type RoleExampleTier } from '@/features/landing/data/exampleCheck'
import { cn } from '@/utils/cn'

const TIER_CARD_TONE: Record<RoleExampleTier, 'light' | 'dark' | 'muted'> = {
  likely: 'light',
  improve: 'dark',
  'not-a-fit': 'muted',
}

const TIER_TEXT_TONE: Record<RoleExampleTier, 'light' | 'dark'> = {
  likely: 'light',
  improve: 'dark',
  'not-a-fit': 'light',
}

const TIER_LABEL: Record<RoleExampleTier, string> = {
  likely: 'Likely Interview Candidate',
  improve: 'Needs Improvement',
  'not-a-fit': 'Not a Fit',
}

export function RoleFeedbackShowcase() {
  const [activeId, setActiveId] = useState(ROLE_EXAMPLES[0].id)
  const active = ROLE_EXAMPLES.find((example) => example.id === activeId) ?? ROLE_EXAMPLES[0]
  const cardTone = TIER_CARD_TONE[active.tier]
  const textTone = TIER_TEXT_TONE[active.tier]
  const isDarkText = textTone === 'dark'

  return (
    <section id="example" className="scroll-mt-[88px] border-b border-border bg-background">
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            Recruiter-style feedback, for every stage of a tech career
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
            The same check, run against five real roles at five experience levels, zero to five years in.
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Example role"
          className="mx-auto mt-5 grid max-w-sm grid-cols-2 gap-2 sm:mt-6 sm:flex sm:max-w-full sm:flex-wrap sm:justify-center"
        >
          {ROLE_EXAMPLES.map((example, index) => {
            const isActive = example.id === activeId
            // Odd item count on the 2-column mobile grid — center the last
            // one across both columns instead of leaving it stranded left.
            const isLastOdd = index === ROLE_EXAMPLES.length - 1 && ROLE_EXAMPLES.length % 2 === 1
            return (
              <button
                key={example.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveId(example.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:px-4 sm:py-2 sm:text-sm',
                  isActive
                    ? 'border-blue bg-blue text-white shadow-glow-sm'
                    : 'border-border-soft bg-surface text-text-secondary hover:border-blue/40 hover:text-text-primary',
                  isLastOdd && 'col-span-2 mx-auto sm:col-span-1 sm:mx-0',
                )}
              >
                {example.role}
              </button>
            )
          })}
        </div>

        <div className="mx-auto mt-5 max-w-2xl transition-all duration-300 sm:mt-6 lg:max-w-[900px]">
          <Card tone={cardTone} className="relative overflow-hidden">
            {/* Corner badge only from lg up, where the 2-column grid leaves
                clear space in the top-right. Below lg the card is a single
                stacked column, so an absolutely-positioned corner badge
                lands directly on top of the role/company line instead —
                the inline copy below replaces it on mobile/tablet. */}
            <span
              className={cn(
                'absolute right-4 top-4 hidden rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide lg:inline-block',
                isDarkText
                  ? 'border-white/20 bg-white/10 text-white/80'
                  : 'border-border-strong bg-surface/80 text-text-secondary',
              )}
            >
              Example result
            </span>
            <CardContent className="px-6 py-5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-0 lg:p-[40px]">
              <div
                className={cn(
                  'flex flex-col lg:justify-center lg:border-r lg:pr-10',
                  isDarkText ? 'lg:border-white/10' : 'lg:border-border',
                )}
              >
                <span
                  className={cn(
                    'mb-2 inline-block w-fit rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide lg:hidden',
                    isDarkText
                      ? 'border-white/20 bg-white/10 text-white/80'
                      : 'border-border-strong bg-surface/80 text-text-secondary',
                  )}
                >
                  Example result
                </span>
                <p className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
                  {active.role}
                </p>
                <p className={cn('text-sm font-semibold', isDarkText ? 'text-blue-light' : 'text-blue')}>
                  {active.companyName} &middot; {active.experience}
                </p>

                <p
                  className={cn(
                    'mt-4 text-3xl font-bold tracking-tight sm:text-4xl',
                    isDarkText ? 'text-white' : 'text-text-primary',
                  )}
                >
                  {active.score}%{' '}
                  <span
                    className={cn(
                      'text-base font-semibold sm:text-lg',
                      isDarkText ? 'text-white/65' : 'text-text-secondary',
                    )}
                  >
                    Interview Score
                  </span>
                </p>
                <p className={cn('mt-1 text-base font-semibold', getVerdictColor(active.score, textTone))}>
                  {TIER_LABEL[active.tier]}
                </p>
              </div>

              <div className="mt-[16px] grid gap-[16px] sm:mt-5 sm:gap-5 lg:mt-0 lg:pl-10">
                <div>
                  <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
                    Strengths
                  </h3>
                  <ul className="mt-2 space-y-3">
                    {active.strengths.map((item) => (
                      <FeedbackBullet key={item} text={item} tone={textTone} />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className={cn('text-sm font-semibold', isDarkText ? 'text-white' : 'text-text-primary')}>
                    Areas to Improve
                  </h3>
                  <ul className="mt-2 space-y-3">
                    {active.improvements.map((item) => (
                      <FeedbackBullet key={item} text={item} tone={textTone} />
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  )
}
