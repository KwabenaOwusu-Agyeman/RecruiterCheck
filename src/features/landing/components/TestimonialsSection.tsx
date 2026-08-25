import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { getPublicTestimonials, type Testimonial } from '@/services/testimonialsService'
import { cn } from '@/utils/cn'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <Star
          key={index}
          className={cn('h-4 w-4', index < rating ? 'fill-warning text-warning' : 'fill-border-strong text-border-strong')}
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
 */
export function TestimonialsSection() {
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
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            What job seekers are saying
          </h2>
        </div>

        {canMarquee ? (
          <div className="relative mt-5 overflow-hidden sm:mt-6 [mask-image:linear-gradient(to_right,transparent,black_64px,black_calc(100%-64px),transparent)]">
            <div className="flex w-max animate-marquee gap-5 hover:[animation-play-state:paused]">
              {[...testimonials, ...testimonials].map((testimonial, index) => (
                <TestimonialCard key={index} testimonial={testimonial} className="w-[320px] shrink-0" />
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto mt-5 grid max-w-5xl grid-cols-1 gap-5 sm:mt-6 sm:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((testimonial, index) => (
              <TestimonialCard key={index} testimonial={testimonial} className="w-full" />
            ))}
          </div>
        )}
      </Container>
    </section>
  )
}

function TestimonialCard({ testimonial, className }: { testimonial: Testimonial; className?: string }) {
  return (
    <Card tone="light-elevated" className={className}>
      <CardContent className="p-6">
        <StarRating rating={testimonial.rating} />
        <p className="mt-4 text-sm leading-relaxed text-text-secondary">
          &ldquo;{testimonial.comment}&rdquo;
        </p>
        <p className="mt-4 text-sm font-semibold text-text-primary">{testimonial.displayName}</p>
        {testimonial.targetRole ? (
          <p className="text-xs text-text-secondary">Checked: {testimonial.targetRole}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
