import { useEffect, useState } from 'react'
import AutoScroll from 'embla-carousel-auto-scroll'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/Carousel'
import { Container } from '@/components/ui/Container'
import { getPublicTestimonials, type Testimonial } from '@/services/testimonialsService'
import { cn } from '@/utils/cn'
import { prefersReducedMotion } from '@/utils/prefersReducedMotion'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn(
            'h-[18px] w-[18px]',
            index < rating ? 'fill-warning text-warning' : 'fill-border-strong text-border-strong',
          )}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}

/**
 * Real testimonials only — backed by public.public_testimonials, which only
 * exposes product_feedback rows a user explicitly marked feature_consent =
 * true (see supabase/migrations/20260824220100_...). Renders nothing rather
 * than a sparse or fabricated section when there are none yet.
 *
 * `compact` tightens the vertical rhythm for the pricing page, where the
 * goal is to get the packs and the first row of reviews into one screen.
 * A prop rather than a className override because this repo's `cn` is a
 * plain join with no tailwind-merge, so a passed-in padding class would not
 * reliably beat the one already on the element.
 */
export function TestimonialsSection({ compact = false }: { compact?: boolean } = {}) {
  const [testimonials, setTestimonials] = useState<Testimonial[] | null>(null)

  useEffect(() => {
    let cancelled = false
    getPublicTestimonials()
      .then((data) => {
        if (!cancelled) setTestimonials(data)
      })
      .catch(() => {
        if (!cancelled) setTestimonials([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!testimonials || testimonials.length === 0) return null

  // A continuous marquee needs enough distinct cards that the loop doesn't
  // read as "the same card twice" — below that, the static grid from before
  // looks more intentional than a marquee with nothing to scroll through.
  const canMarquee = testimonials.length >= 4

  return (
    <section className="border-b border-border bg-background">
      <Container className={compact ? 'py-6 sm:py-8' : 'py-8 sm:py-12 lg:py-[64px]'}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue">Reviews</p>
          <h2 className="mt-2 font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            Trusted by job seekers
          </h2>
        </div>

        {/* Mobile: one review at a time, stepped with buttons. A marquee on a
            narrow screen either crawls past unreadably or fights the user's
            own scroll, so below sm it is replaced outright rather than
            restyled. */}
        <MobileReviews testimonials={testimonials} />

        {/* Desktop: the same embla auto-scroll engine as the jobs ticker, so
            both are tuned in the same units. This used to be a CSS keyframe
            with only a duration, which meant its pace could not be compared
            with, or set alongside, the other carousel. */}
        <div className="hidden sm:block">
          {canMarquee ? (
            <div className="relative mt-6 [mask-image:linear-gradient(to_right,transparent,black_64px,black_calc(100%-64px),transparent)]">
              <Carousel
                opts={{ loop: true, align: 'start', dragFree: true, containScroll: false }}
                plugins={[
                  AutoScroll({
                    playOnInit: !prefersReducedMotion(),
                    // Rightward, matching the jobs ticker. Embla's 'forward'
                    // is the opposite, conventional right-to-left drift.
                    direction: 'backward',
                    speed: 0.25,
                    stopOnInteraction: false,
                    stopOnMouseEnter: true,
                  }),
                ]}
              >
                <CarouselContent className="ml-0 items-stretch">
                  {testimonials.map((testimonial, index) => (
                    <CarouselItem key={index} className="basis-auto pl-0">
                      <TestimonialCard testimonial={testimonial} className="mx-2.5 h-full w-[340px]" />
                    </CarouselItem>
                  ))}
                  {/* A second pass guarantees the slides outrun the viewport
                      on wide screens, which is embla's condition for looping
                      at all. Hidden from assistive tech so the reviews are
                      not announced twice. */}
                  {testimonials.map((testimonial, index) => (
                    <CarouselItem key={`repeat-${index}`} className="basis-auto pl-0" aria-hidden>
                      <TestimonialCard testimonial={testimonial} className="mx-2.5 h-full w-[340px]" />
                    </CarouselItem>
                  ))}
                </CarouselContent>
              </Carousel>
            </div>
          ) : (
            <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 items-stretch gap-5 sm:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <TestimonialCard key={index} testimonial={testimonial} className="w-full" />
              ))}
            </div>
          )}
        </div>
      </Container>
    </section>
  )
}

/**
 * Mobile-only review stepper: one card, a previous/next control and a dot per
 * review. Deliberately not a carousel — no auto-scroll, no drag, no second
 * copy of the list — so nothing moves under the reader's thumb and the
 * section costs exactly one card of vertical space.
 */
function MobileReviews({ testimonials }: { testimonials: Testimonial[] }) {
  const [index, setIndex] = useState(0)
  const total = testimonials.length
  const step = (delta: number) => setIndex((current) => (current + delta + total) % total)

  return (
    <div className="mt-4 sm:hidden">
      <TestimonialCard testimonial={testimonials[index]} className="w-full" />

      {total > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous review"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary transition-colors active:bg-border-soft"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-2">
            {testimonials.map((testimonial, dotIndex) => (
              <button
                key={testimonial.displayName + dotIndex}
                type="button"
                onClick={() => setIndex(dotIndex)}
                aria-label={`Review ${dotIndex + 1} of ${total}`}
                aria-current={dotIndex === index}
                className={cn(
                  'h-2 rounded-full transition-all',
                  dotIndex === index ? 'w-5 bg-blue' : 'w-2 bg-border-strong',
                )}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next review"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary transition-colors active:bg-border-soft"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Card sits on the same cream as the section behind it, so it never reads as
 * a high-contrast panel, but the edge is strong enough to hold its own shape
 * (see the `seamless` tone in Card.tsx). Content is deliberately only four
 * things: stars, comment, name, application.
 */
function TestimonialCard({
  testimonial,
  className,
  ...rest
}: { testimonial: Testimonial; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <Card tone="seamless" className={className} {...rest}>
      <CardContent className="flex h-full flex-col p-5">
        <StarRating rating={testimonial.rating} />

        {/* flex-1 so the quote absorbs the slack in an equal-height row and
            the name lands on the same baseline in every card. */}
        <p className="mt-4 flex-1 text-[15px] leading-[1.65] text-text-primary">{testimonial.comment}</p>

        <div className="mt-5">
          <p className="text-sm font-semibold text-text-primary">{testimonial.displayName}</p>
          {testimonial.targetRole ? (
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              Application: {testimonial.targetRole}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
