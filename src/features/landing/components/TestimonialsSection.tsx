import { useEffect, useState } from 'react'
import AutoScroll from 'embla-carousel-auto-scroll'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Carousel, CarouselContent, CarouselItem } from '@/components/ui/Carousel'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { getPublicTestimonials, type Testimonial } from '@/services/testimonialsService'
import { cn } from '@/utils/cn'
import { isDesktopViewport } from '@/utils/isDesktopViewport'
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

  // Only a confirmed-empty result removes the section. While the fetch is
  // still in flight the section renders at its full height with a
  // placeholder, because returning null here and mounting the real block
  // later inserted ~650px into the middle of the page after first paint.
  // Chrome absorbs that with scroll anchoring; iOS Safari has no scroll
  // anchoring at all, so on a phone everything below the reviews jumped the
  // moment the data landed — the page "scrolling by itself" while the
  // reader was somewhere near this section.
  if (testimonials && testimonials.length === 0) return null

  const loading = testimonials === null

  // A continuous marquee needs enough distinct cards that the loop doesn't
  // read as "the same card twice" — below that, the static grid from before
  // looks more intentional than a marquee with nothing to scroll through.
  const canMarquee = !loading && testimonials.length >= 4

  return (
    <section className="border-b border-border bg-background">
      <Container className={compact ? 'py-6 sm:py-8' : 'py-[48px] sm:py-[64px] lg:py-[88px]'}>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">Job seeker stories</p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            What changed after their first check
          </h2>
        </div>

        {/* Mobile: one review at a time, stepped with buttons. A marquee on a
            narrow screen either crawls past unreadably or fights the user's
            own scroll, so below sm it is replaced outright rather than
            restyled. */}
        {loading ? (
          <div className="mt-4 sm:hidden">
            {/* 392px is the measured height of the loaded block at 390px
                wide: a 316px card, plus the 32px gap and 44px control row
                under it. */}
            <TestimonialPlaceholder className="min-h-[392px] w-full" />
          </div>
        ) : (
          <MobileReviews testimonials={testimonials} />
        )}

        {/* Desktop: the same embla auto-scroll engine as the jobs ticker, so
            both are tuned in the same units. This used to be a CSS keyframe
            with only a duration, which meant its pace could not be compared
            with, or set alongside, the other carousel. */}
        {/* min-h is the measured height of a loaded card row (343px at every
            width from 640px up, since the cards are fixed-width and
            equal-height). Reserved up front for the same reason as the
            mobile block above. */}
        <div className="hidden min-h-[343px] sm:block">
          {loading ? (
            <div className="mx-auto mt-6 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <TestimonialPlaceholder key={index} className="h-[343px] w-full" />
              ))}
            </div>
          ) : canMarquee ? (
            <div className="relative mt-6 [mask-image:linear-gradient(to_right,transparent,black_64px,black_calc(100%-64px),transparent)]">
              <Carousel
                opts={{ loop: true, align: 'start', dragFree: true, containScroll: false }}
                plugins={[
                  AutoScroll({
                    // Below sm this whole block is `display: none`, but the
                    // carousel is still mounted, so the auto-scroll engine
                    // would keep driving an invisible, zero-width Embla
                    // instance on every frame — and re-measure it on every
                    // iOS address-bar resize, mid-scroll. Never start it on
                    // a phone.
                    playOnInit: isDesktopViewport() && !prefersReducedMotion(),
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

        {compact ? null : (
          <SectionCta secondaryTo="/pricing" secondaryLabel="See the packs" primary={false} />
        )}
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
      {/* One box, one height, whichever review is showing: the six real
          cards range from 290px to 315px, so without a floor every tap of
          the arrows nudged the rest of the page up or down. */}
      <div className="flex min-h-[316px]">
        <TestimonialCard testimonial={testimonials[index]} className="w-full" />
      </div>

      {total > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous review"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary transition-colors active:bg-border-soft"
          >
            <ChevronLeft className="h-[16px] w-[16px]" aria-hidden="true" />
          </button>

          <div className="flex items-center">
            {/* The dot stays 8px; the button around it is a 24px target so
                the row remains tappable without growing visually. */}
            {testimonials.map((testimonial, dotIndex) => (
              <button
                key={testimonial.displayName + dotIndex}
                type="button"
                onClick={() => setIndex(dotIndex)}
                aria-label={`Review ${dotIndex + 1} of ${total}`}
                aria-current={dotIndex === index}
                className="flex h-[24px] min-w-[24px] items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
              >
                <span
                  className={cn(
                    'h-[8px] rounded-full transition-all',
                    dotIndex === index ? 'w-[20px] bg-blue' : 'w-[8px] bg-border-strong',
                  )}
                />
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next review"
            className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-border-strong bg-surface text-text-primary transition-colors active:bg-border-soft"
          >
            <ChevronRight className="h-[16px] w-[16px]" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Holds the exact space a real card will take while the reviews are still
 * loading. Deliberately not the shared `Skeleton`: that one pulses in
 * `bg-background`, which is now the page colour itself and so would be
 * invisible here.
 */
function TestimonialPlaceholder({ className }: { className?: string }) {
  return (
    <Card tone="seamless" className={className}>
      <CardContent className="flex h-full flex-col p-5">
        <div className="h-[18px] w-[110px] animate-pulse rounded-md bg-border-soft" />
        <div className="mt-4 flex-1 space-y-2.5">
          <div className="h-3 w-full animate-pulse rounded-md bg-border-soft" />
          <div className="h-3 w-11/12 animate-pulse rounded-md bg-border-soft" />
          <div className="h-3 w-10/12 animate-pulse rounded-md bg-border-soft" />
        </div>
        <div className="mt-5 h-3 w-[120px] animate-pulse rounded-md bg-border-soft" />
      </CardContent>
    </Card>
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
