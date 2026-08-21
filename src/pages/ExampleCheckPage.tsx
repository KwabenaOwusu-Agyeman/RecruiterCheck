import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { FeedbackBullet, getVerdictColor } from '@/components/feedback/FeedbackBullet'
import {
  EXAMPLE_CANDIDATE_NAME,
  EXAMPLE_CHECK,
  EXAMPLE_COMPANY_NAME,
  EXAMPLE_JOB_TITLE,
} from '@/features/landing/data/exampleCheck'
import { useCheckCta } from '@/hooks/useCheckCta'
import { usePageMeta } from '@/hooks/usePageMeta'
import { getScoreLabel } from '@/lib/scoring'
import { cn } from '@/utils/cn'

export function ExampleCheckPage() {
  usePageMeta({
    title: 'Example Recruiter Check — MyRecruiterCheck',
    description:
      'See a fictional example of the recruiter-style feedback MyRecruiterCheck gives: an Interview Probability, Strengths, Areas to Improve, and Prospects.',
    path: '/example-check',
  })

  const handleCheckCta = useCheckCta()
  const { score, strengths, improvements, prospects } = EXAMPLE_CHECK

  return (
    <Container className="py-8 lg:max-w-[1000px]">
      <BackLink to="/" />

      <Alert variant="info" className="mt-3">
        This is a fictional example, not a real user&rsquo;s data — it shows the kind of feedback
        MyRecruiterCheck gives.
      </Alert>

      <div className="mt-3 rounded-[20px] border border-white/20 bg-navy p-3 shadow-elevated sm:p-4">
        <div className="border-b border-white/10 pb-5 sm:pb-7">
          <p className="text-sm font-semibold text-white/75">Example Recruiter Check</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white sm:text-[28px]">
            {EXAMPLE_JOB_TITLE}
          </h1>
          <p className="mt-1 text-base font-semibold text-blue-light">{EXAMPLE_COMPANY_NAME}</p>
          <p className="mt-1 text-sm text-white/75">Candidate: {EXAMPLE_CANDIDATE_NAME}</p>

          <div className="mt-5 border-t border-white/10 pt-5">
            <p className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
              {score}%{' '}
              <span className="text-lg font-semibold text-white/65 sm:text-xl">
                Interview Probability
              </span>
            </p>
            <p className={cn('mt-2 text-lg font-semibold', getVerdictColor(score, 'dark'))}>
              {getScoreLabel(score)}
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4 sm:mt-7">
          <div className="grid gap-4 md:grid-cols-2">
            <Card tone="nested">
              <CardHeader tone="nested" className="px-5 py-3">
                <h2 className="text-base font-semibold text-white">Strengths</h2>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <ul className="space-y-3">
                  {strengths.map((item) => (
                    <FeedbackBullet key={item} text={item} tone="dark" />
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card tone="nested">
              <CardHeader tone="nested" className="px-5 py-3">
                <h2 className="text-base font-semibold text-white">Areas to Improve</h2>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <ul className="space-y-3">
                  {improvements.map((item) => (
                    <FeedbackBullet key={item} text={item} tone="dark" />
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card tone="nested">
            <CardHeader tone="nested" className="px-5 py-3">
              <h2 className="text-base font-semibold text-white">Prospects</h2>
              <p className="mt-0.5 text-xs text-white/75">
                What could improve your chances of getting an interview.
              </p>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <ul className="space-y-2">
                {prospects.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-blue-light" aria-hidden="true">
                      •
                    </span>
                    <span className="text-sm leading-snug text-white/85">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card tone="nested-highlighted">
            <CardHeader tone="nested" className="px-5 py-3">
              <h2 className="text-base font-semibold text-white">Recommendation</h2>
              <p className="mt-1 text-xs text-white/75">
                On a real check, this generates an improved CV draft, cover letter, and recruiter message
                from your own information.
              </p>
            </CardHeader>
          </Card>
        </div>
      </div>

      <div className="mt-6 text-center">
        <Button variant="accent" size="lg" onClick={handleCheckCta}>
          Check
        </Button>
      </div>
    </Container>
  )
}
