import { Link } from 'react-router-dom'
import { Target } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { HeroVerdictPreview } from '@/features/landing/components/HeroVerdictPreview'
import { useCheckCta } from '@/hooks/useCheckCta'

/**
 * Split hero from lg up: the message on the left (~55%), a static recruiter
 * verdict preview on the right (~45%), so the first desktop viewport shows
 * the product itself, not only the claim about it. Below lg the message
 * keeps the centred single-column treatment and the preview follows the CTA
 * and reassurance line — message, action, then proof, in that order.
 *
 * The messaging hierarchy itself (eyebrow, headline, subheadline, scoring
 * line, USP capsule, CTA pair, reassurance) is unchanged from the previous
 * centred hero. The earlier decision that removed an interactive verdict
 * card from the hero stands: this preview is static, compact, badged
 * Example, and the full range of outcomes still belongs to the verdict trio
 * below (see HeroVerdictPreview).
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
      <Container className="relative pb-[40px] pt-[40px] sm:pt-8 lg:pb-[64px] lg:pt-[72px]">
        <div className="lg:grid lg:grid-cols-[11fr_9fr] lg:items-center lg:gap-[56px]">
          <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:max-w-none lg:text-left">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
              Think like a recruiter before you apply
            </p>
            {/* 52px at lg, not the 60px the full-width hero carried: in a
                55% column 60px runs to four lines and towers over the
                preview card; 52px holds the question to three. */}
            <h1 className="font-display mt-3 text-balance text-[40px] leading-[1.12] text-text-primary sm:text-5xl lg:text-[52px] lg:leading-[1.08]">
              If you were the{' '}
              <span className="bg-gradient-to-r from-navy to-blue bg-clip-text text-transparent">recruiter</span>,
              would you invite yourself to an{' '}
              <span className="bg-gradient-to-r from-blue to-navy bg-clip-text text-transparent">interview</span>?
            </h1>
            <p className="mx-auto mt-4 max-w-[600px] text-base leading-relaxed text-text-secondary sm:text-lg lg:mx-0">
              See how a recruiter would score your CV against the job you want, before you apply.
            </p>
            {/* The scoring basis, stated next to the word "score" rather than
                anywhere else on the page: one line that turns the number from
                "an AI's opinion" into a structured evaluation. Smaller and
                quieter than the subheadline so the two grey lines read as
                statement and footnote, not one paragraph. */}
            <p className="mx-auto mt-2 max-w-[600px] text-[13px] font-medium text-text-secondary/80 sm:text-sm lg:mx-0">
              Scored on experience, required skills and candidate value.
            </p>

            {/* The USP gets its own object rather than trailing the sentence
                above: this line answers "is this built for me?", which is the
                question a new visitor decides on, and as plain trailing copy
                it read as an afterthought. A gradient ring rather than a
                tinted pill: the same navy-into-blue ramp as the headline
                keywords, wrapped around a surface capsule (the GlowCard
                border technique, static). */}
            <div className="mx-auto mt-5 w-fit rounded-full bg-gradient-to-r from-navy via-blue to-blue-light p-[1.5px] lg:mx-0">
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
            <div
              data-hero-cta
              className="mt-5 flex flex-col items-center justify-center gap-3 sm:mt-6 sm:flex-row sm:gap-5 lg:justify-start"
            >
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

          {/* Proof after the ask on phones (message, CTA, reassurance, then
              the example), beside it from lg up. */}
          <div className="mx-auto mt-6 w-full max-w-[480px] sm:mt-7 lg:mx-0 lg:mt-0 lg:max-w-none">
            <HeroVerdictPreview />
          </div>
        </div>
      </Container>
    </section>
  )
}
