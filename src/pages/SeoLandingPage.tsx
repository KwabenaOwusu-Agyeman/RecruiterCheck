import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { usePageMeta } from '@/hooks/usePageMeta'

interface SeoLandingPageProps {
  title: string
  description: string
  path: string
  eyebrow: string
  heading: string
  introduction: string
  directAnswer?: string
  benefits: readonly { title: string; description: string }[]
  steps: readonly string[]
  example?: { title: string; scenario: string; insight: string }
  verdict?: { jobTitle: string; reject: readonly string[]; accept: readonly string[] }
  faqs?: readonly { question: string; answer: string }[]
  relatedLinks?: readonly { label: string; to: string }[]
}

export function SeoLandingPage({
  title,
  description,
  path,
  eyebrow,
  heading,
  introduction,
  directAnswer,
  benefits,
  steps,
  example,
  verdict,
  faqs = [],
  relatedLinks = [],
}: SeoLandingPageProps) {
  const handleCheckCta = useCheckCta()
  usePageMeta({ title, description, path })

  return (
    <main>
      <section className="border-b border-border-soft bg-surface py-16 sm:py-24">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue">{eyebrow}</p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl">
              {heading}
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-text-secondary">
              {introduction}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={handleCheckCta}>Check My Application</Button>
              <Link
                to="/example-check"
                className="inline-flex h-[52px] items-center justify-center rounded-xl border border-navy bg-surface px-5 text-sm font-medium text-text-primary transition-colors hover:bg-background sm:h-[48px] sm:rounded-[10px]"
              >
                See an example
              </Link>
            </div>
          </div>
        </Container>
      </section>

      {directAnswer && (
        <section className="border-b border-border-soft bg-background py-10 sm:py-14">
          <Container>
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
                What does this tool check?
              </h2>
              <p className="mt-4 leading-7 text-text-secondary">{directAnswer}</p>
            </div>
          </Container>
        </section>
      )}

      <section className="py-14 sm:py-20">
        <Container>
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {benefits.map((benefit) => (
              <article key={benefit.title} className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-xl font-semibold text-text-primary">{benefit.title}</h2>
                <p className="mt-3 leading-7 text-text-secondary">{benefit.description}</p>
              </article>
            ))}
          </div>
        </Container>
      </section>

      {verdict && (
        <section className="py-14 sm:py-20">
          <Container>
            <div className="mx-auto grid max-w-4xl gap-5 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold text-text-primary">3 things recruiters reject</h2>
                <ul className="mt-4 space-y-3">
                  {verdict.reject.map((item) => (
                    <li key={item} className="leading-6 text-text-secondary">{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-border bg-surface p-6">
                <h2 className="text-lg font-semibold text-text-primary">3 things recruiters accept</h2>
                <ul className="mt-4 space-y-3">
                  {verdict.accept.map((item) => (
                    <li key={item} className="leading-6 text-text-secondary">{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mx-auto mt-8 flex max-w-4xl flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:text-left">
              <p className="text-text-secondary">Check your {verdict.jobTitle} resume like a recruiter would</p>
              <Button onClick={handleCheckCta}>Check</Button>
            </div>
          </Container>
        </section>
      )}

      <section className="border-y border-border-soft bg-surface py-14 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-3xl font-semibold tracking-tight text-text-primary">How it works</h2>
            <ol className="mt-8 space-y-5">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-4 text-text-secondary">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue text-sm font-semibold text-white">
                    {index + 1}
                  </span>
                  <span className="pt-1 leading-7">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-10 text-sm leading-6 text-text-secondary">
              MyRecruiterCheck provides an evidence based estimate and practical feedback. It cannot guarantee an interview or hiring decision.
            </p>
          </div>
        </Container>
      </section>

      {example && (
        <section className="py-14 sm:py-20">
          <Container>
            <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-surface p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-text-primary">{example.title}</h2>
              <p className="mt-4 leading-7 text-text-secondary">{example.scenario}</p>
              <p className="mt-4 leading-7 text-text-secondary">{example.insight}</p>
            </div>
          </Container>
        </section>
      )}

      {faqs.length > 0 && (
        <section className="border-t border-border-soft py-14 sm:py-20">
          <Container>
            <div className="mx-auto max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight text-text-primary">
                Frequently asked questions
              </h2>
              <div className="mt-8 divide-y divide-border rounded-2xl border border-border bg-surface px-6">
                {faqs.map((faq) => (
                  <article key={faq.question} className="py-6">
                    <h3 className="text-lg font-semibold text-text-primary">{faq.question}</h3>
                    <p className="mt-3 leading-7 text-text-secondary">{faq.answer}</p>
                  </article>
                ))}
              </div>
            </div>
          </Container>
        </section>
      )}

      {faqs.length > 0 && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'FAQPage',
              mainEntity: faqs.map(({ question, answer }) => ({
                '@type': 'Question',
                name: question,
                acceptedAnswer: { '@type': 'Answer', text: answer },
              })),
            }),
          }}
        />
      )}

      {relatedLinks.length > 0 && (
        <section className="border-t border-border-soft bg-surface py-10">
          <Container>
            <nav className="mx-auto flex max-w-3xl flex-wrap items-center gap-3" aria-label="Related tools">
              <span className="text-sm font-semibold text-text-primary">Related tools:</span>
              {relatedLinks.map((link) => (
                <Link key={link.to} to={link.to} className="text-sm font-medium text-blue hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          </Container>
        </section>
      )}
    </main>
  )
}
