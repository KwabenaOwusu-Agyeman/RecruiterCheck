import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { useCheckCta } from '@/hooks/useCheckCta'
import { usePageMeta } from '@/hooks/usePageMeta'
import { BRAND } from '@/lib/constants'

const factors = [
  {
    weight: '40%',
    title: 'Experience',
    description:
      'Whether your background is at the level and scope this specific role needs. For early career candidates, relevant internships, academic projects, and coursework can count alongside paid roles, provided the CV describes what was actually done.',
    subcriteria: 'Assessed across three checks: evidence of having applied the relevant skill in practice, the skill itself being applied at the level the role needs, and measurable results from that work.',
  },
  {
    weight: '35%',
    title: 'Skills',
    description:
      'Whether the tools and skills the job description asks for are shown with evidence, a project, a result, a specific context, rather than only appearing in a skills list.',
    subcriteria: 'Assessed across four checks: coverage of the essential skills the job asks for, evidence those skills were actually applied, familiarity with the specific tools and platforms named, and relevant certifications where the role calls for them.',
  },
  {
    weight: '25%',
    title: 'Candidate value',
    description:
      'Whether there is a clear, specific reason to interview you over another applicant with a similar background, based on what your CV actually demonstrates.',
    subcriteria: 'Assessed across four checks: overall fit with the role, a clear value proposition for why you specifically, how clearly your CV communicates technical work, and how well the CV itself is structured.',
  },
] as const

const doesNotMeasure = [
  'It does not guarantee an interview or a hiring decision. Recruiters weigh other candidates and factors no CV checker can see.',
  'It is not a statistical probability calculated from historical hiring data. It is a structured, evidence based estimate of how convincingly your CV matches this job description.',
  'It does not measure culture fit, interview performance, references, or anything outside the CV and job description you provide.',
] as const

const faqs = [
  {
    question: 'Why does the CV need to be compared with a specific job description?',
    answer:
      'A CV that reads well in general can still fail to show the exact experience, skills and evidence a specific job asks for. Comparing against one job description lets MyRecruiterCheck evaluate relevance and evidence the way a recruiter actually reads an application, against that one role, not a generic standard.',
  },
  {
    question: 'What counts as "evidence" versus a keyword?',
    answer:
      'A keyword is a skill or tool named once, often in a list. Evidence is that same skill shown in context, a project it was used on, a result it produced, a scale it operated at. Interview Score is built from evidence, so two CVs that list the same keywords can still receive different scores based on what actually backs them up.',
  },
  {
    question: 'How do projects, internships or a career change count if I don\'t have direct job experience?',
    answer:
      'MyRecruiterCheck evaluates whatever evidence is actually in your CV. For early career candidates and career changers, that often means academic projects, internships, personal projects, and transferable experience from a different field, as long as the CV describes them specifically rather than listing them as bare headings.',
  },
  {
    question: 'Why did my score change after I edited my CV?',
    answer:
      'Interview Score is recalculated from what is currently written in your CV. Adding specific, credible evidence for whichever factor was weakest, most often candidate value, typically produces the biggest change.',
  },
  {
    question: 'Is this the same as an ATS keyword score?',
    answer:
      'No. An ATS keyword score typically counts whether words from the job description appear somewhere in your CV. Interview Score evaluates whether your experience, skills and value are genuinely demonstrated with evidence, which is closer to how a recruiter reads a CV after it clears keyword screening.',
  },
]

export function HowInterviewScoreWorksPage() {
  const handleCheckCta = useCheckCta()
  usePageMeta({
    title: 'How the MyRecruiterCheck Interview Score Works',
    description:
      'How Interview Score is calculated from experience (40%), skills (35%) and candidate value (25%), what counts as evidence, and what the score does and does not measure.',
    path: '/how-interview-score-works',
  })

  return (
    <main>
      <section className="border-b border-border-soft bg-background py-12 sm:py-16 lg:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue">Methodology</p>
            <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl lg:text-[44px]">
              How the Interview Score works
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-text-secondary">
              An evidence based estimate of how convincingly your CV matches one specific job, built from experience, skills and candidate value.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-b border-border-soft bg-background py-8 sm:py-12">
        <Container>
          <Card className="mx-auto max-w-3xl">
            <CardContent className="p-6 sm:p-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
                The short answer
              </h2>
              <p className="mt-4 leading-7 text-text-secondary">
                Interview Score compares your CV with one specific job description and scores three
                factors: experience (40%), skills (35%) and candidate value (25%). Each factor is
                judged on evidence already in your CV, a project, a result, a tool used in context,
                not on whether a keyword is present. It is an evidence based estimate of how
                convincingly your application matches this role. It cannot guarantee an interview,
                and it never invents experience, skills or achievements you didn't provide.
              </p>
            </CardContent>
          </Card>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Why compare against one specific job, not a generic CV score
            </h2>
            <p className="mt-4 leading-7 text-text-secondary">
              A CV that reads well on its own can still be a poor match for a specific role, and a CV
              that looks unremarkable in general can be a strong match for the right one. Recruiters
              don't score CVs in isolation, they judge each application against the job in front of
              them. MyRecruiterCheck works the same way: every check requires both your CV and the job
              description, and the score, Strengths, Areas to Improve and Prospects are specific to
              that pairing.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-y border-border-soft bg-background py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-4xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              The three factors
            </h2>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {factors.map((factor) => (
                <Card key={factor.title} className="h-full">
                  <CardContent className="p-6">
                    <p className="text-sm font-semibold uppercase tracking-wide text-blue">{factor.weight}</p>
                    <h3 className="mt-2 text-xl font-semibold text-text-primary">{factor.title}</h3>
                    <p className="mt-3 leading-7 text-text-secondary">{factor.description}</p>
                    <p className="mt-3 text-sm leading-6 text-text-secondary">{factor.subcriteria}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Why listed keywords alone aren't enough
            </h2>
            <p className="mt-4 leading-7 text-text-secondary">
              A CV can contain every keyword from a job description and still fail to convince a
              recruiter, because a keyword only shows that a word is present, not that the skill
              behind it is real or relevant at the level the role needs. MyRecruiterCheck looks for
              evidence: a specific project, a measurable result, a tool used in a real context. Two CVs
              that list the same skills can receive different scores depending on whether those skills
              are actually demonstrated.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              What raises or lowers your score
            </h2>
            <p className="mt-4 leading-7 text-text-secondary">
              Your score rises when your CV describes specific, verifiable evidence for the skills
              and experience the job asks for, in context, not just as a listed keyword. A CV that
              only claims a skill without showing where it was used gets partial credit at best.
            </p>
            <p className="mt-4 leading-7 text-text-secondary">
              One rule can override everything else: if the job description names a genuinely
              critical requirement and your CV shows no matching evidence for it, your score is
              capped below the "Needs Improvement" threshold, regardless of how strong the rest of
              your application is. This reflects how a recruiter actually screens, a single missing
              must have can rule an application out even when everything else looks good.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-y border-border-soft bg-background py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              How early career evidence counts
            </h2>
            <p className="mt-4 leading-7 text-text-secondary">
              MyRecruiterCheck is built for candidates with 0 to 5 years of experience, including
              people applying with academic projects, internships, bootcamp work, or a career change
              into tech, AI, machine learning or data. None of that is scored differently just because
              it isn't a full time job title. What matters is whether the CV describes what was
              actually built, analyzed or delivered, and connects it to the skills and experience level
              the job description asks for. A well described personal project can carry more weight
              than a job title with no detail behind it.
            </p>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Why your score changes when you edit your CV
            </h2>
            <p className="mt-4 leading-7 text-text-secondary">
              Interview Score is calculated fresh from whatever is currently in your CV and the job
              description you provided, it is not a fixed rating of you as a candidate. Adding specific
              evidence for your weakest factor, most often candidate value, is usually what moves the
              score the most, because it gives the recruiter a clearer reason to choose you.
            </p>
          </div>
        </Container>
      </section>

      <section className="border-y border-border-soft bg-background py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              What Interview Score does not measure
            </h2>
            <ul className="mt-6 space-y-4">
              {doesNotMeasure.map((item) => (
                <li key={item} className="flex gap-3 leading-7 text-text-secondary">
                  <span aria-hidden="true" className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-navy" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <section className="py-10 sm:py-14">
        <Container>
          <Card className="mx-auto max-w-3xl">
            <CardContent className="p-6 sm:p-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
                How your CV and job description are handled
              </h2>
              <p className="mt-4 leading-7 text-text-secondary">
                MyRecruiterCheck operates from the Netherlands and is the data controller for your
                personal data under the GDPR. Your original uploaded CV and any documents generated for
                you are automatically and permanently deleted from our storage within 24 hours of being
                processed. Job description text is stored only temporarily and is deleted once it's
                been used to run a check, or after 48 hours at the latest. Your CV and job description
                are used only to generate your results and are never used to train models. Full details,
                including your rights under the GDPR, are in our{' '}
                <Link to="/privacy" className="font-medium text-blue hover:underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </Container>
      </section>

      <section className="border-t border-border-soft py-10 sm:py-14">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h2 className="font-display text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
              Frequently asked questions
            </h2>
            <div className="mt-8 divide-y divide-border rounded-[16px] border border-border-soft bg-surface shadow-card">
              {faqs.map((faq) => (
                <article key={faq.question} className="px-6 py-6">
                  <h3 className="text-lg font-semibold text-text-primary">{faq.question}</h3>
                  <p className="mt-3 leading-7 text-text-secondary">{faq.answer}</p>
                </article>
              ))}
            </div>
          </div>
        </Container>
      </section>

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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: BRAND.canonicalUrl },
              { '@type': 'ListItem', position: 2, name: 'How Interview Score Works', item: `${BRAND.canonicalUrl}/how-interview-score-works` },
            ],
          }),
        }}
      />

      <section className="border-t border-border-soft bg-background py-10 sm:py-14">
        <Container>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            <p className="text-lg font-medium text-text-primary">See your Interview Score for a real job</p>
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <Button size="lg" onClick={handleCheckCta}>Check My Application</Button>
              <Link
                to="/application-checker"
                className="text-sm font-medium text-blue hover:underline"
              >
                Learn about the Application Checker
              </Link>
            </div>
            <p className="text-xs font-medium text-text-secondary">First check free. No card required.</p>
          </div>
        </Container>
      </section>
    </main>
  )
}
