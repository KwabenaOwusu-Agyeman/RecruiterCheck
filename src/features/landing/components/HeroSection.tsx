import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { BRAND } from '@/lib/constants'

export function HeroSection() {
  const { open } = useAuthModal()

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-16 sm:py-20">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-xl font-bold text-navy sm:text-2xl">
            💡 {BRAND.tagline.replace(/\.$/, '')}!
          </p>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
            If you were the recruiter, would you invite yourself to an interview?
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-text-secondary">
            Upload your CV and the job description to receive feedback from a recruiter.
            Get a recruiter tailored CV, cover letter, and email ready to send.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
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
