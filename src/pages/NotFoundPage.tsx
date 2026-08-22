import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { usePageMeta } from '@/hooks/usePageMeta'

export function NotFoundPage() {
  usePageMeta({
    title: 'Page not found | MyRecruiterCheck',
    description: 'This page could not be found. Head back to the homepage or check your application.',
    path: '/404',
    noindex: true,
  })

  const handleCheckCta = useCheckCta()

  return (
    <main>
      <section className="py-16 sm:py-24 lg:py-32">
        <Container>
          <div className="mx-auto max-w-xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue">404</p>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
              We couldn't find that page
            </h1>
            <p className="mx-auto mt-5 max-w-md text-lg leading-8 text-text-secondary">
              The page you're looking for may have moved or no longer exists. Try heading back home or checking your application instead.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={handleCheckCta}>Check My Application</Button>
              <Link
                to="/"
                className="inline-flex h-[52px] items-center justify-center rounded-[10px] border border-border-strong bg-surface px-5 text-sm font-medium text-text-primary transition-colors duration-150 hover:border-navy/40 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue focus-visible:ring-offset-2 sm:h-[48px]"
              >
                Back to homepage
              </Link>
            </div>
          </div>
        </Container>
      </section>
    </main>
  )
}
