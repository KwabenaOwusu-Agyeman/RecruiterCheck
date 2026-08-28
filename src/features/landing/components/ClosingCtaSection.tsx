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
            'mx-auto max-w-xl text-center sm:max-w-none sm:rounded-[20px] sm:bg-navy sm:px-8 sm:py-12 sm:shadow-elevated lg:mx-auto lg:max-w-[1120px] lg:rounded-[24px] lg:px-[64px] lg:py-[64px]',
          )}>
          <h2 className="font-display text-[24px] text-text-primary sm:text-[32px] sm:text-white lg:text-[44px] lg:leading-[1.14]">
            Ready to improve your application?
          </h2>
          <div className="mt-[20px] flex flex-col items-center gap-2 sm:mt-[32px]">
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
