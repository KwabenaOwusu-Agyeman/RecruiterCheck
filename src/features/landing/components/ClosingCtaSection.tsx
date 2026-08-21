import { useRef } from 'react'
import { motion, useInView } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'

export function ClosingCtaSection() {
  const handleCheckCta = useCheckCta()
  const sectionRef = useRef<HTMLElement>(null)
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 })

  return (
    <section ref={sectionRef} className="border-b border-border bg-surface">
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.45, ease: 'easeOut' }}
          className="mx-auto max-w-xl text-center sm:max-w-none sm:rounded-[20px] sm:bg-navy sm:px-8 sm:py-12 sm:shadow-elevated lg:mx-auto lg:max-w-[1120px] lg:rounded-[24px] lg:px-[64px] lg:py-[64px]">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl sm:text-white">
            Ready to improve your application?
          </h2>
          <div className="mt-[20px] flex justify-center sm:mt-8">
            <Button
              size="md"
              variant="ghost"
              className="sm:!h-12 sm:bg-white sm:px-6 sm:text-base sm:text-navy sm:hover:!bg-white/90"
              onClick={handleCheckCta}
            >
              Check My Application
            </Button>
          </div>
        </motion.div>
      </Container>
    </section>
  )
}
