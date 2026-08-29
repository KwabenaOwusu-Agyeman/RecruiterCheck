import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'

/**
 * The same hero system the 23 SEO pages use: Fraunces headline, blue
 * tracked eyebrow, the USP capsule, and a primary action paired with a
 * quiet secondary link. The example itself lives one scroll down in the
 * tier trio (the owner's call: all three outcomes visible at once beats an
 * interactive card that hides the range behind clicks), which also carries
 * the #example anchor the header and SEO pages link to.
 */
export function HeroSection() {
  const handleCheckCta = useCheckCta()

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
            Think like a recruiter before you apply
          </p>
          <h1 className="font-display mt-3 text-balance text-[40px] leading-[1.12] text-text-primary sm:text-5xl lg:text-[60px] lg:leading-[1.08]">
            If you were the{' '}
            <span className="bg-gradient-to-r from-navy to-blue bg-clip-text text-transparent">recruiter</span>,
            would you invite yourself to an{' '}
            <span className="bg-gradient-to-r from-blue to-navy bg-clip-text text-transparent">interview</span>?
          </h1>
          <p className="mx-auto mt-4 max-w-[600px] text-base leading-relaxed text-text-secondary sm:text-lg">
            Get a recruiter's verdict on your CV before you apply.
          </p>

          {/* The USP gets its own object rather than trailing the sentence
              above: this line answers "is this built for me?", which is the
              question a new visitor decides on, and as plain trailing copy
              it read as an afterthought. Deliberately unlike the role pills
              below — one wide capsule with an icon, tinted and bordered,
              against their small unfilled buttons — so a static claim is
              never mistaken for a control. */}
          {/* A gradient ring rather than a tinted pill: the same
              navy-into-blue ramp as the headline keywords, wrapped around a
              surface capsule (the GlowCard border technique, static). One
              perimeter of colour reads as considered where a filled tint
              pill reads as a default badge. */}
          <div className="mx-auto mt-5 w-fit rounded-full bg-gradient-to-r from-navy via-blue to-blue-light p-[1.5px]">
            <p className="flex items-center gap-2.5 rounded-full bg-surface px-[16px] py-[10px] text-left text-[15px] font-semibold leading-snug text-navy sm:gap-3 sm:px-[20px] sm:text-base">
              <Target className="h-[18px] w-[18px] shrink-0 text-blue" strokeWidth={2} aria-hidden="true" />
              {/* text-balance: on a phone this runs to two lines; balancing
                  splits them evenly at the comma instead of leaving one word
                  orphaned on the second line. */}
              <span className="text-balance">
                Built for AI/ML, data and tech roles. 0 to 5 years of work experience.
              </span>
            </p>
          </div>
          <div data-hero-cta className="mt-5 flex flex-col items-center justify-center gap-3 sm:mt-6 sm:flex-row sm:gap-5">
            <Button size="lg" onClick={handleCheckCta}>
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

      </Container>
    </section>
  )
}
