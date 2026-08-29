import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { useRevealOnScroll } from '@/hooks/useRevealOnScroll'
import { cn } from '@/utils/cn'

/**
 * The navy closing card at every width, phones included — previously the
 * card existed only from sm up, which left the mobile page ending on a bare
 * heading over cream while the sticky bar showed a second button for the
 * same action in the same viewport. Now the ending is the same deliberate
 * navy bookend everywhere, and StickyMobileCta hides itself while this card
 * is on screen (via data-closing-cta), so the close is the emotional ask
 * and the sticky bar is the functional one — never both at once.
 */
export function ClosingCtaSection() {
  const handleCheckCta = useCheckCta()
  const [sectionRef, isVisible] = useRevealOnScroll<HTMLElement>({ amount: 0.3 })

  return (
    <section ref={sectionRef} className="border-b border-border bg-background">
      <Container className="py-[48px] sm:py-[64px] lg:py-[88px]">
        <div
          data-closing-cta
          className={cn(
            !isVisible && 'opacity-0',
            isVisible && 'animate-fade-in-up',
            'relative mx-auto max-w-xl overflow-hidden rounded-[20px] bg-navy px-[20px] py-[40px] text-center shadow-elevated sm:max-w-none sm:px-8 sm:py-12 lg:max-w-[1120px] lg:px-[64px] lg:py-[64px]',
          )}>
          {/* The hero's quiet texture, bookending the page: same dot grid,
              same soft wash, visible only where the navy card exists. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.09)_1px,transparent_1px)] bg-[length:26px_26px] [mask-image:radial-gradient(ellipse_65%_70%_at_50%_30%,black_0%,transparent_75%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-[-40%] h-[300px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_50%_50%_at_50%_50%,rgba(143,178,240,0.22),transparent_70%)]"
          />
          <h2 className="relative font-display text-[24px] text-white sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            Ready to improve your application?
          </h2>
          <div className="relative mt-[20px] flex flex-col items-center gap-2 sm:mt-[32px]">
            <Button size="md" variant="light" onClick={handleCheckCta}>
              Check My Application
            </Button>
            <p className="text-xs font-medium text-white/70">First check free. No card required.</p>
          </div>
        </div>
      </Container>
    </section>
  )
}
