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
    description: 'Get your Interview Probability Score, strengths, areas to improve, and prospects.',
  },
  {
    number: '03',
    title: 'Improve before you apply',
    description: 'Get a tailored CV, cover letter, and recruiter message ready to send.',
  },
] as const

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-border bg-surface">
      <Container className="py-12">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-text-secondary">
            See your application the way a recruiter would, then improve it before you apply.
          </p>
        </div>

        <ol className="mx-auto mt-8 grid max-w-4xl gap-6 sm:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.number}
              className="rounded-xl border-2 border-navy bg-background p-5 shadow-lg"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-lg font-bold text-white">
                {Number(step.number)}
              </span>
              <h3 className="mt-3 text-base font-semibold text-text-primary">{step.title}</h3>
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
