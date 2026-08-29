import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { VerdictCard } from '@/features/landing/components/VerdictCard'
import { ROLE_EXAMPLES } from '@/features/landing/data/exampleCheck'

/**
 * With the role chooser and the live verdict card promoted into the hero,
 * this section stopped repeating that trick and took a different job:
 * showing the range of outcomes. Three verdicts side by side — one per
 * score tier — so a visitor sees the tool say "no" and "not yet", not just
 * "yes". A checker that only ever shows an 85% is indistinguishable from
 * flattery; the spread is what makes the top card credible.
 *
 * Card tones deliberately diverge (light / dark / muted) so the three
 * outcomes read as three different verdicts rather than one template with
 * the number swapped.
 */
const TIER_SHOWCASE = [
  { id: 'software-engineer', tone: 'light' },
  { id: 'ai-ml-engineer', tone: 'dark' },
  { id: 'junior-data-analyst', tone: 'muted' },
] as const

export function RoleFeedbackShowcase() {
  const examples = TIER_SHOWCASE.map(({ id, tone }) => ({
    tone,
    example: ROLE_EXAMPLES.find((candidate) => candidate.id === id),
  }))

  return (
    <section id="example" className="scroll-mt-[88px] border-b border-border bg-background">
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            The full range of verdicts
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            An honest verdict, not a pat on the back
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            The same check reads every application differently. Strong ones hear it, weak ones hear
            why, and poor fits are told before the rejection email says it.
          </p>
        </div>

        <div className="mx-auto mt-6 grid max-w-2xl grid-cols-1 items-stretch gap-[16px] sm:mt-8 sm:gap-5 lg:max-w-none lg:grid-cols-3">
          {examples.map(({ example, tone }) =>
            example ? (
              <VerdictCard key={example.id} example={example} tone={tone} compact stacked className="h-full" />
            ) : null,
          )}
        </div>

        <SectionCta secondaryTo="/how-recruiters-evaluate-a-cv" secondaryLabel="How recruiters evaluate a CV" primary={false} />
      </Container>
    </section>
  )
}
