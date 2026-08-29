import { useRef, type ReactNode } from 'react'
import { Check, ChevronRight, FileText, Upload } from 'lucide-react'
import { Container } from '@/components/ui/Container'
import { ScoreLockup } from '@/components/feedback/ScoreLockup'
import { SectionCta } from '@/features/landing/components/SectionCta'
import { TimelineContent } from '@/components/ui/timeline-animation'

/**
 * Each step card carries a small visual of the moment it describes — the
 * same code-built imagery approach as the hero and dashboard mocks, in
 * miniature. This was the last text-only section on the page; a feature
 * card without a picture is the tell of a template.
 */
function StepMockUpload() {
  return (
    <div className="flex h-[72px] items-center justify-center gap-3 rounded-[8px] border border-dashed border-border-strong bg-background px-4">
      <Upload className="h-[16px] w-[16px] shrink-0 text-blue" strokeWidth={2} aria-hidden="true" />
      <span className="text-sm font-medium text-text-secondary">cv.pdf</span>
      <span className="rounded-full bg-navy-tint px-2 py-0.5 text-xs font-semibold text-blue">Uploaded</span>
    </div>
  )
}

function StepMockScore() {
  // The miniature of the shared score lockup — same Fraunces numeral, same
  // tier gauge as the hero preview and the trio, so step 2's picture is the
  // signature at small size rather than an ad-hoc restyling of it.
  return (
    <div className="flex h-[72px] flex-col justify-center rounded-[8px] border border-border-soft bg-background px-4">
      <ScoreLockup score={85} scoreWidthClass="w-[85%]" size="sm" />
    </div>
  )
}

function StepMockDocument() {
  return (
    <div className="flex h-[72px] items-center gap-3 rounded-[8px] border border-border-soft bg-background px-4">
      <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[8px] bg-navy-tint">
        <FileText className="h-[16px] w-[16px] text-blue" strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold text-text-primary">Improved CV draft</span>
        <span className="text-xs text-text-secondary">Ready to download</span>
      </span>
      <Check className="ml-auto h-[16px] w-[16px] shrink-0 text-success" strokeWidth={2} aria-hidden="true" />
    </div>
  )
}

const steps: readonly { number: string; title: string; description: string; mock: ReactNode }[] = [
  {
    number: '01',
    title: 'Add your application',
    description: 'Upload your CV and paste the job you are applying for.',
    mock: <StepMockUpload />,
  },
  {
    number: '02',
    title: 'See what a recruiter sees',
    description: 'Get your Interview Score, strengths, areas to improve, and prospects.',
    mock: <StepMockScore />,
  },
  {
    number: '03',
    title: 'Improve before you apply',
    description: 'Get your feedback report, plus an improved CV draft when it can help.',
    mock: <StepMockDocument />,
  },
]

export function HowItWorksSection() {
  const sectionRef = useRef<HTMLElement>(null)

  return (
    <section
      id="how-it-works"
      ref={sectionRef}
      className="scroll-mt-[88px] border-b border-border bg-background"
    >
      <Container className="py-[48px] sm:py-[64px] lg:py-[88px]">
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
          {/* Direction markers on the connector, sitting in the two column
              gaps at the number-circle height, so the three cards read as
              one journey (input, assessment, outcome) instead of three
              parallel features. The x offsets centre each 24px badge in its
              28px gap: a 3-column grid's gap centres sit at 33.333% minus
              g/6 and 66.667% plus g/6. */}
          {['left-[calc(33.333%-5px)]', 'left-[calc(66.667%+5px)]'].map((position) => (
            <span
              key={position}
              aria-hidden="true"
              className={`pointer-events-none absolute top-[48px] hidden h-[24px] w-[24px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-border-strong bg-surface text-blue lg:flex ${position}`}
            >
              <ChevronRight className="h-[14px] w-[14px]" strokeWidth={2.5} />
            </span>
          ))}
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
              <div className="mt-4" aria-hidden="true">
                {step.mock}
              </div>
              <h3 className="mt-4 text-lg font-semibold leading-snug text-text-primary sm:text-xl">
                {step.title}
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-text-secondary sm:text-base">
                {step.description}
              </p>
            </TimelineContent>
          ))}
        </ol>

        <SectionCta secondaryTo="/how-interview-score-works" secondaryLabel="See how the Interview Score is calculated" primary={false} />
      </Container>
    </section>
  )
}
