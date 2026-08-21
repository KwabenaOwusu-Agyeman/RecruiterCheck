import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useAuthModal } from '@/features/auth/context/AuthModalContext'
import { useCheckCta } from '@/hooks/useCheckCta'
import { BRAND } from '@/lib/constants'

export function HeroSection() {
  const { open } = useAuthModal()
  const handleCheckCta = useCheckCta()

  return (
    <section className="relative overflow-hidden border-b border-border bg-gradient-hero">
      <Container className="relative py-[40px] sm:py-16 lg:py-[96px]">
        <div className="mx-auto max-w-2xl text-center lg:max-w-[800px]">
          <p className="mb-4 text-xl font-bold text-navy sm:text-2xl">{BRAND.tagline}</p>
          <h1 className="text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl lg:text-[54px] lg:leading-[1.1]">
            If you were the recruiter, would you invite yourself to an interview?
          </h1>
          <p className="mx-auto mt-[16px] max-w-none text-lg leading-relaxed text-text-secondary sm:mt-5 lg:max-w-[680px] lg:text-xl">
            See what recruiters see. Improve your application before you apply.
          </p>
          <div className="mt-[20px] flex flex-col items-center justify-center gap-3 sm:mt-6">
            <Button size="md" className="sm:!h-12 sm:px-6 sm:text-base" onClick={handleCheckCta}>
              Check My Application
            </Button>
          </div>
          <p className="mt-4 text-sm text-text-secondary">
            Built on what real recruiters flag first.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            Already have an account?{' '}
            <button
              type="button"
              className="font-semibold text-blue hover:underline"
              onClick={() => open('sign-in')}
            >
              Sign in
            </button>
          </p>
        </div>
      </Container>
    </section>
  )
}
