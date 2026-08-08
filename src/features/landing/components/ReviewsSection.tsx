import { Container } from '@/components/ui/Container'

// Placeholder example reviews for design purposes — replace with real
// customer testimonials before launch.
const reviews = [
  {
    quote:
      'I finally understood why my applications weren’t landing interviews. The feedback pointed straight at what I’d have missed on my own.',
    name: 'Amara O.',
    role: 'Marketing Coordinator',
    rating: 5,
  },
  {
    quote:
      'Reading my CV the way a recruiter would was eye opening. I tightened my experience section and started getting callbacks within a week.',
    name: 'Daniel K.',
    role: 'Data Analyst',
    rating: 5,
  },
  {
    quote:
      'The tailored cover letter alone was worth it. It felt specific to the role instead of generic, and I didn’t have to write it from scratch.',
    name: 'Priya S.',
    role: 'Product Designer',
    rating: 4,
  },
] as const

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <svg
          key={index}
          viewBox="0 0 20 20"
          className={index < rating ? 'h-4 w-4 fill-warning' : 'h-4 w-4 fill-border'}
          aria-hidden="true"
        >
          <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.77l-5.18 2.67.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
        </svg>
      ))}
    </div>
  )
}

export function ReviewsSection() {
  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-16">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            What job seekers are saying
          </h2>
        </div>

        <ul className="mx-auto mt-10 grid max-w-4xl gap-6 sm:grid-cols-3">
          {reviews.map((review) => (
            <li
              key={review.name}
              className="flex flex-col rounded-xl border border-navy bg-background p-6"
            >
              <StarRating rating={review.rating} />
              <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
                &ldquo;{review.quote}&rdquo;
              </p>
              <div className="mt-4">
                <p className="text-sm font-semibold text-text-primary">{review.name}</p>
                <p className="text-xs text-text-secondary">{review.role}</p>
              </div>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  )
}
