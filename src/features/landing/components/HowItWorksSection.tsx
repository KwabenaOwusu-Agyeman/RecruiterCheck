import { useRef } from 'react'
import { Container } from '@/components/ui/Container'
import { SectionCta } from '@/features/landing/components/SectionCta'
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

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null)

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="scroll-mt-[88px] border-b border-border bg-background"
    >
      <Container className="py-[56px] sm:py-16 lg:py-[112px]">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue sm:text-sm">
            The process
          </p>
          <h2 className="mt-2 font-display text-[24px] text-text-primary sm:text-[32px] lg:text-[44px] lg:leading-[1.14]">
            How it works
          </h2>
        </div>

        <ol className="relative mx-auto mt-7 grid max-w-5xl items-stretch gap-[16px] sm:mt-9 sm:grid-cols-3 sm:gap-6 lg:gap-[28px]">
          <div
            className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-[48px] hidden h-px bg-border-strong lg:block"
            aria-hidden="true"
          />
          {steps.map((step, index) => (
            <TimelineContent
              key={step.number}
              as="li"
              animationNum={index}
              timelineRef={sectionRef}
              className="relative flex h-full flex-col rounded-[20px] border border-border-soft bg-surface p-5 shadow-card sm:p-6 lg:p-[28px]"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy text-base font-semibold text-white sm:h-10 sm:w-10 sm:text-lg">
                {Number(step.number)}
              </span>
              <h3 className="mt-3 text-lg font-semibold leading-snug text-text-primary sm:mt-4 sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary sm:text-base">
                {step.description}
              </p>
            </TimelineContent>
          ))}
        </ol>

        <SectionCta secondaryTo="/how-interview-score-works" secondaryLabel="See how the Interview Score is calculated" />
      </Container>
    </section>
  )
}
