import { Container } from '@/components/ui/Container'

const steps = [
  {
    number: '01',
    title: 'Upload your CV and job description',
    description: 'Add your CV and the job description you are applying for.',
  },
  {
    number: '02',
    title: 'Get recruiter feedback and your score',
    description: 'Receive recruiter style feedback and an interview probability score.',
  },
  {
    number: '03',
    title: 'Download your recruiter tailored documents',
    description: 'Get a recruiter tailored CV, cover letter, and email to apply with confidence.',
  },
] as const

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-b border-border bg-surface">
      <Container className="py-16">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            How it works
          </h2>
          <p className="mt-3 text-text-secondary">
            A straightforward process designed to mirror how recruiters review applications.
          </p>
        </div>

        <ol className="mx-auto mt-10 grid max-w-4xl gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <li
              key={step.number}
              className="rounded-xl border-2 border-navy bg-background p-6 shadow-lg"
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
