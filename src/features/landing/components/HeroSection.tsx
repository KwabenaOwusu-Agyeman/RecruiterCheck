import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { VerdictCard } from '@/features/landing/components/VerdictCard'
import { ROLE_EXAMPLES } from '@/features/landing/data/exampleCheck'
import { useCheckCta } from '@/hooks/useCheckCta'
import { cn } from '@/utils/cn'

/**
 * The first screen carries the product, not just the pitch: the same hero
 * system the 23 SEO pages already use (Fraunces headline, blue tracked
 * eyebrow, 18px subcopy, a primary action paired with a quiet secondary
 * link), plus the two things monday.com's brand-search hero has that a
 * text-only hero lacks — a control that asks the visitor to participate
 * (the role pills) and the product itself (the verdict card) visible before
 * any scrolling.
 *
 * The picked role is not forgotten on click: it rides into /checks/new as
 * ?role= and prefills the job title there, surviving the sign-up flow via
 * the stored post-auth redirect.
 */
export function HeroSection() {
  const handleCheckCta = useCheckCta()
  const [activeId, setActiveId] = useState(ROLE_EXAMPLES[0].id)
  const active = ROLE_EXAMPLES.find((example) => example.id === activeId) ?? ROLE_EXAMPLES[0]

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      {/* Faint dot-grid backdrop, the same "quiet technical texture" pattern
          Linear/Vercel use on light hero sections — radial-masked so it
          reads as depth near the edges rather than noise behind the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(2,12,56,0.12)_1px,transparent_1px)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_0%,transparent_75%)]"
      />
      <Container className="relative pb-[40px] pt-[40px] sm:pt-8 lg:pb-7 lg:pt-[80px]">
        <div className="mx-auto max-w-2xl text-center lg:max-w-[900px]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            Think like a recruiter
          </p>
          <h1 className="font-display mt-3 text-balance text-[40px] leading-[1.12] text-text-primary sm:text-5xl lg:text-[60px] lg:leading-[1.08]">
            If you were the <span className="text-blue">recruiter</span>, would you invite yourself
            to an <span className="text-blue">interview</span>?
          </h1>
          <p className="mx-auto mt-4 max-w-[600px] text-base leading-relaxed text-text-secondary sm:text-lg">
            Get a recruiter's verdict on your CV before you apply. Built for AI/ML, data and tech
            roles, zero to five years in.
          </p>
          <div data-hero-cta className="mt-5 flex flex-col items-center justify-center gap-3 sm:mt-6 sm:flex-row sm:gap-5">
            <Button size="lg" onClick={() => handleCheckCta({ role: active.role })}>
              Check My Application
            </Button>
            <Link
              to="/how-interview-score-works"
              className="text-base font-medium text-blue underline-offset-4 transition-colors hover:text-navy hover:underline"
            >
              See how the score works
            </Link>
          </div>
          <p className="mt-3 text-xs font-medium text-text-secondary">First check free. No card required.</p>
        </div>

        {/* The participation moment: pick your role, watch the verdict
            change. The same device as monday's "What would you like to
            explore?" card, built from this product's own material. */}
        <div
          role="tablist"
          aria-label="Example role"
          className="mx-auto mt-7 grid max-w-sm grid-cols-2 gap-2 sm:mt-8 sm:flex sm:max-w-full sm:flex-wrap sm:justify-center"
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
                  'flex h-11 items-center justify-center rounded-full border px-4 text-sm font-semibold transition-all duration-200 sm:h-[40px] sm:px-5',
                  isActive
                    ? 'border-blue bg-blue text-white'
                    : 'border-border-soft bg-surface text-text-secondary hover:border-blue/40 hover:text-text-primary',
                  isLastOdd && 'col-span-2 mx-auto w-full sm:col-span-1 sm:mx-0 sm:w-auto',
                )}
              >
                {example.role}
              </button>
            )
          })}
        </div>

        <VerdictCard
          example={active}
          compact
          className="mx-auto mt-5 max-w-2xl sm:mt-6 lg:max-w-[900px]"
        />
      </Container>
    </section>
  )
}
