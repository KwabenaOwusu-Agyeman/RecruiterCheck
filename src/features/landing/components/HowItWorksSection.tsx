import { useRef } from 'react'
import type { Variants } from 'motion/react'
import { Container } from '@/components/ui/Container'
import { TimelineContent } from '@/components/ui/timeline-animation'

const steps = [
  {
    number: '01',
    title: 'Add your application',
    description: 'Upload your CV and paste the job description.',
  },
  {
    number: '02',
    title: 'See what a recruiter sees',
    description: 'Get your Interview Score, strengths, areas to improve, and prospects.',
  },
  {
    number: '03',
    title: 'Improve before you apply',
    description: 'Get your feedback report, plus an improved CV draft when it can help.',
  },
] as const

const stepVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.12, ease: 'easeOut' },
  }),
}

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null)

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="scroll-mt-[88px] border-b border-border bg-background"
    >
      <Container className="py-[32px] sm:py-12 lg:py-[64px]">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl lg:text-[32px]">
            How it works
          </h2>
        </div>

        <ol className="relative mx-auto mt-5 grid max-w-4xl items-stretch gap-[16px] sm:mt-[32px] sm:gap-6 sm:grid-cols-3 lg:gap-[24px]">
          <div
            className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-[52px] hidden h-px bg-border-strong lg:block"
            aria-hidden="true"
          />
          {steps.map((step, index) => (
            <TimelineContent
              key={step.number}
              as="li"
              animationNum={index}
              timelineRef={sectionRef}
              customVariants={stepVariants}
              className="relative flex h-full flex-col rounded-[16px] border border-border-soft bg-surface p-3.5 shadow-card sm:p-5 lg:p-[24px]"
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-navy text-base font-bold text-white sm:h-10 sm:w-10 sm:text-lg">
                {Number(step.number)}
              </span>
              <h3 className="mt-2.5 font-display text-base font-semibold leading-[1.4] text-text-primary sm:mt-3 sm:min-h-[64px] sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-text-secondary sm:mt-2">
                {step.description}
              </p>
            </TimelineContent>
          ))}
        </ol>
      </Container>
    </section>
  )
}
