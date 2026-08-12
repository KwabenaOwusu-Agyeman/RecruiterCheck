import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'

export function ClosingCtaSection() {
  const { open } = useAuthModal()
  const handleCheckCta = useCheckCta()

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-xl text-center sm:max-w-none sm:rounded-[20px] sm:bg-navy sm:px-8 sm:py-12 lg:mx-auto lg:max-w-[1120px] lg:rounded-[24px] lg:px-[64px] lg:py-[64px]">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl sm:text-white">
            Would you interview yourself?
          </h2>
          <p className="mt-3 text-text-secondary sm:text-white/70">
            Check your application before the recruiter does.
          </p>
          <div className="mt-[20px] flex flex-col items-center justify-center gap-3 sm:mt-8 sm:flex-row">
            <Button
              size="md"
              variant="ghost"
              className="sm:!h-12 sm:bg-white sm:px-6 sm:text-base sm:text-navy sm:hover:!bg-white/90"
              onClick={handleCheckCta}
            >
              Check My Application
            </Button>
            <button
              type="button"
              onClick={() => open('sign-in')}
              className="text-sm font-semibold text-text-secondary underline-offset-4 transition-colors hover:underline sm:text-white/80 sm:hover:text-white"
            >
              Sign In
            </button>
          </div>
        </div>
      </Container>
    </section>
  )
}
