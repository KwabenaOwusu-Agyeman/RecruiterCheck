import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll'
import { cn } from '@/utils/cn'

export function ClosingCtaSection() {
  const handleCheckCta = useCheckCta()
  const [sectionRef, isVisible] = useRevealOnScroll<HTMLElement>({ amount: 0.3 })

  return (
    <section ref={sectionRef} className="border-b border-border bg-background">
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div
          className={cn(
            !isVisible && 'opacity-0',
            isVisible && 'animate-fade-in-up',
            'relative mx-auto max-w-xl overflow-hidden text-center sm:max-w-none sm:rounded-[20px] sm:bg-navy sm:px-8 sm:py-12 sm:shadow-elevated lg:mx-auto lg:max-w-[1120px] lg:rounded-[20px] lg:px-[64px] lg:py-[64px]',
          )}>
          {/* The hero's quiet texture, bookending the page: same dot grid,
              same soft wash, visible only where the navy card exists. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle,rgba(255,255,255,0.09)_1px,transparent_1px)] bg-[length:26px_26px] [mask-image:radial-gradient(ellipse_65%_70%_at_50%_30%,black_0%,transparent_75%)] sm:block"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-40%] hidden h-[300px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(143,178,240,0.22),transparent_70%)] sm:block"
          />
          <h2 className="relative font-display text-[24px] text-text-primary sm:text-[32px] sm:text-white lg:text-[44px] lg:leading-[1.14]">
            Ready to improve your application?
          </h2>
          <div className="relative mt-[20px] flex flex-col items-center gap-2 sm:mt-[32px]">
            <Button
              size="md"
              className="sm:!h-12 sm:bg-white sm:px-6 sm:text-base sm:!text-navy sm:hover:!bg-white/90"
              onClick={handleCheckCta}
            >
              Check My Application
            </Button>
            <p className="text-xs font-medium text-text-secondary sm:text-white/70">First check free. No card required.</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
