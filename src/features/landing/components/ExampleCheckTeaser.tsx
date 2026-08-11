import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { FeedbackBullet, getVerdictColor } from '@/components/feedback/FeedbackBullet'
import {
  EXAMPLE_CHECK,
  EXAMPLE_COMPANY_NAME,
  EXAMPLE_JOB_TITLE,
} from '@/features/landing/data/exampleCheck'
import { getScoreLabel } from '@/lib/scoring'
import { cn } from '@/utils/cn'

export function ExampleCheckTeaser() {
  const { score, strengths, improvements } = EXAMPLE_CHECK

  return (
    <section className="border-b border-border bg-surface">
      <Container className="py-12">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            See RecruiterCheck in Action
          </h2>
          <p className="mt-3 text-text-secondary">
            See what recruiter-style feedback looks like before checking your own application.
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-2xl">
          <Card className="relative overflow-hidden shadow-lg">
            <span className="absolute right-4 top-4 rounded-full border border-navy bg-surface px-2.5 py-1 text-xs font-semibold text-text-secondary">
              Example
            </span>

            <CardHeader className="px-6 py-4">
              <p className="text-sm font-semibold text-text-primary">{EXAMPLE_JOB_TITLE}</p>
              <p className="text-sm font-semibold text-navy">{EXAMPLE_COMPANY_NAME}</p>
            </CardHeader>

            <CardContent className="px-6 py-5">
              <p className="text-3xl font-bold tracking-tight text-navy sm:text-4xl">
                {score}%{' '}
                <span className="text-base font-semibold text-text-secondary sm:text-lg">
                  Interview Probability
                </span>
              </p>
              <p className={cn('mt-1 text-base font-semibold', getVerdictColor(score))}>
                {getScoreLabel(score)}
              </p>

              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Strengths</h3>
                  <ul className="mt-2 space-y-3">
                    {strengths.map((item) => (
                      <FeedbackBullet key={item} text={item} />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-text-primary">Areas to Improve</h3>
                  <ul className="mt-2 space-y-3">
                    {[improvements[0], improvements[2]].map((item) => (
                      <FeedbackBullet key={item} text={item} />
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </Container>
    </section>
  )
}
