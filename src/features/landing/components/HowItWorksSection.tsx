import { Container } from '@/components/ui/Container'

const steps = [
  {
    number: '01',
    title: 'Add your application',
    description: 'Upload your CV and paste the job description.',
  },
  {
    number: '02',
    title: 'See what a recruiter sees',
    description: 'Get your Interview Probability, strengths, areas to improve, and prospects.',
  },
  {
    number: '03',
    title: 'Improve before you apply',
    description: 'Get a tailored CV, cover letter, and recruiter message ready to send.',
  },
] as const

export function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-[88px] border-b border-border bg-surface"
    >
      <Container className="py-[32px] sm:py-12 lg:py-[88px]">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl lg:text-[32px]">
            How it works
          </h2>
        </div>

        <ol className="relative mx-auto mt-[24px] grid max-w-4xl items-stretch gap-[16px] sm:mt-8 sm:gap-6 sm:grid-cols-3 lg:gap-[24px]">
          <div
            className="pointer-events-none absolute left-[16.5%] right-[16.5%] top-[52px] hidden h-px bg-border-strong lg:block"
            aria-hidden="true"
          />
          {steps.map((step) => (
            <li
              key={step.number}
              className="relative flex h-full flex-col rounded-xl border-2 border-navy bg-background p-[16px] shadow-lg sm:rounded-[16px] sm:border sm:border-border-soft sm:bg-surface sm:p-5 sm:shadow-card lg:p-[24px]"
            >
              <span className="relative flex h-10 w-10 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">
                {Number(step.number)}
              </span>
              <h3 className="mt-3 text-base font-semibold text-text-primary sm:text-lg">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}
