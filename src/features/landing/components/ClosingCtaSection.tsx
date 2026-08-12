import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'

export function ClosingCtaSection() {
  const { open } = useAuthModal()

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-[32px] sm:py-12">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Would you interview yourself?
          </h2>
          <p className="mt-3 text-text-secondary">
            Check your application before the recruiter does.
          </p>
          <div className="mt-[20px] sm:mt-6">
            <Button size="md" onClick={() => open('sign-up')}>
              Sign Up
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
