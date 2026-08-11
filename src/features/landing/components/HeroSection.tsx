import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { BRAND } from '@/lib/constants'

export function HeroSection() {
  const { open } = useAuthModal()

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-14 sm:py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xl font-bold text-navy sm:text-2xl">{BRAND.tagline}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
            If you were the recruiter, would you invite yourself to an interview?
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-text-secondary">
            See your application from a recruiter&rsquo;s perspective. Get your interview
            probability, clear feedback, and tailored application documents before you apply.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="md" onClick={() => open('sign-up')}>
              Sign Up
            </Button>
            <Button variant="secondary" size="md" onClick={() => open('sign-in')}>
              Sign In
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
