import AutoScroll from 'embla-carousel-auto-scroll'
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/Carousel'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { prefersReducedMotion } from '@/utils/prefersReducedMotion'

/**
 * Illustrative examples of the roles a Recruiter Check covers, not a feed of
 * real checks. The point is recognition: a visitor should spot their own job
 * title here and understand the product applies to them.
 *
 * Deliberately no company names anywhere on this section. Roles are spread
 * across AI/ML, data, and tech at zero to five years of experience, matching
 * the range the product is built for. Swap for real check volume only once
 * there is enough of it to beat this curated spread.
 */
const EXAMPLE_ROLES = [
  'Data Analyst, Entry Level',
  'AI Engineer',
  'Graduate Software Engineer',
  'Junior Data Scientist',
  'Machine Learning Engineer',
  'Backend Engineer',
  'Data Engineer',
  'MLOps Engineer',
  'QA Test Engineer',
  'Analytics Engineer',
]

export function JobsYouCanCheckSection() {

  return (
    <section className="border-b border-border bg-background">
      <Container className="py-[48px] sm:py-14 lg:py-[80px]">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">Jobs we check</p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Jobs you can check
          </h2>
          <p className="mt-3 text-base text-text-secondary sm:text-lg">
            AI, data and tech roles, from your first internship to five years in.
          </p>
        </div>

        <div className="relative mx-auto mt-6 flex items-center justify-center sm:mt-8">
          <Carousel
            className="w-full"
            opts={{ loop: true, align: 'start', dragFree: true, containScroll: false }}
            plugins={[
              AutoScroll({
                playOnInit: !prefersReducedMotion(),
                // Content travels rightward, the left-to-right direction this
                // ticker has always used. Embla's 'forward' is the opposite
                // (the conventional right-to-left ticker).
                direction: 'backward',
                // Deliberately very slow: this is ambient texture behind the
                // headline, not something asking to be read at pace.
                speed: 0.5,
                stopOnInteraction: false,
                stopOnMouseEnter: true,
              }),
            ]}
          >
            <CarouselContent className="ml-0 items-center">
              {EXAMPLE_ROLES.map((role) => (
                <CarouselItem key={role} className="basis-auto pl-0">
                  <RoleChip role={role} />
                </CarouselItem>
              ))}
              {/* A second pass guarantees the slides outrun the viewport on wide
                  screens, which is Embla's condition for looping at all. Hidden
                  from assistive tech so the list isn't announced twice. */}
              {EXAMPLE_ROLES.map((role) => (
                <CarouselItem key={`repeat-${role}`} className="basis-auto pl-0" aria-hidden>
                  <RoleChip role={role} />
                </CarouselItem>
              ))}
            </CarouselContent>
          </Carousel>

          {/* Edges fade into the section background so chips enter and leave
              instead of being clipped against a hard border. */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-background to-transparent" />
        </div>

        <SectionCta secondaryTo="/free-cv-checker" secondaryLabel="Try the free CV checker" />
      </Container>
    </section>
  )
}

/**
 * Set as plain wordmarks, the way a "trusted by" logo row reads: no pill,
 * no border, no card. The roles themselves are the graphic, so spacing and
 * weight carry the rhythm instead of a container.
 */
function RoleChip({ role }: { role: string }) {
  return (
    <span className="mx-7 shrink-0 whitespace-nowrap text-lg font-medium tracking-[-0.015em] text-text-secondary sm:mx-12 sm:text-[22px]">
      {role}
    </span>
  )
}
