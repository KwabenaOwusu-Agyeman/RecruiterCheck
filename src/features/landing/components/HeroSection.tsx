import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { BRAND } from '@/lib/constants'

const TAGLINE = `${BRAND.tagline} Built for AI/ML, data and tech roles. 0 to 5 years of experience.`

export function HeroSection() {
  const handleCheckCta = useCheckCta()

  return (
    <section className="relative overflow-hidden border-b border-border bg-background">
      {/* Faint dot-grid backdrop, the same "quiet technical texture" pattern
          Linear/Vercel use on light hero sections — radial-masked so it
          reads as depth near the edges rather than noise behind the text. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(2,12,56,0.12)_1px,transparent_1px)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black_0%,transparent_75%)]"
      />
      <Container className="relative py-[28px] sm:py-8 lg:py-10">
        <div className="mx-auto max-w-2xl text-center lg:max-w-[800px]">
          <p className="mb-3 text-[14px] font-medium text-text-secondary sm:text-base">{TAGLINE}</p>
          <h1 className="text-4xl text-text-primary sm:text-5xl lg:text-[54px] lg:leading-[1.1]">
            If you were the <span className="text-blue">recruiter</span>, would you invite yourself
            to an <span className="text-blue">interview</span>?
          </h1>
          <p className="mx-auto mt-3 max-w-none text-[14px] font-medium leading-relaxed text-text-secondary sm:text-base lg:max-w-[680px]">
            Get a recruiter's verdict on your CV, before you apply.
          </p>
          <div className="mt-4 flex flex-col items-center justify-center gap-2 sm:mt-5">
            <Button size="md" className="sm:!h-12 sm:px-6 sm:text-base" onClick={handleCheckCta}>
              Check My Application
            </Button>
            <p className="text-xs font-medium text-text-secondary">First check free. No card required.</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
