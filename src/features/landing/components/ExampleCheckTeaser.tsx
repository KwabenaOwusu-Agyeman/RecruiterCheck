import NumberFlow from '@number-flow/react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/Card'
import { Container } from '@/components/ui/Container'
import { FeedbackBullet, getVerdictColor } from '@/components/feedback/FeedbackBullet'
import {
  EXAMPLE_CHECK,
  EXAMPLE_COMPANY_NAME,
  EXAMPLE_JOB_TITLE,
} from '@/features/landing/data/exampleCheck'
import { getScoreLabel } from '@/lib/scoring'
import { BRAND } from '@/lib/constants'
import { cn } from '@/utils/cn'

export function ExampleCheckTeaser() {
  const { score, strengths, improvements } = EXAMPLE_CHECK

  return (
    <section
      id="example"
      className="scroll-mt-[88px] border-b border-border bg-surface"
    >
      <Container className="py-[32px] sm:py-12 lg:py-[96px]">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-[20px] font-semibold tracking-tight text-text-primary sm:text-3xl">
            See {BRAND.name} in Action
          </h2>
          <p className="mt-3 text-[14px] text-text-secondary sm:text-base">
            See what recruiter-style feedback looks like before checking your own application.
          </p>
        </div>

        <div className="mx-auto mt-[24px] max-w-2xl sm:mt-8 lg:max-w-[900px]">
          <Card tone="dark" className="relative overflow-hidden">
            <CardContent className="px-6 py-5 lg:grid lg:grid-cols-2 lg:gap-x-10 lg:gap-y-0 lg:p-[40px]">
              <div className="flex flex-col lg:justify-center lg:border-r lg:border-white/10 lg:pr-10">
                <p className="text-sm font-semibold text-white">{EXAMPLE_JOB_TITLE}</p>
                <p className="text-sm font-semibold text-blue-light">{EXAMPLE_COMPANY_NAME}</p>

                <p className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  <NumberFlow value={score} suffix="%" willChange />{' '}
                  <span className="text-base font-semibold text-white/65 sm:text-lg">
                    Interview Probability
                  </span>
                </p>
                <p className={cn('mt-1 text-base font-semibold', getVerdictColor(score, 'dark'))}>
                  {getScoreLabel(score)}
                </p>

                <Link
                  to="/example-check"
                  className="mt-8 flex items-center gap-1.5 text-sm font-semibold text-blue-light hover:underline"
                >
                  See the full example
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="mt-[16px] grid gap-[16px] sm:mt-5 sm:gap-5 lg:mt-0 lg:pl-10">
                <div>
                  <h3 className="text-sm font-semibold text-white">Strengths</h3>
                  <ul className="mt-2 space-y-3">
                    {strengths.map((item) => (
                      <FeedbackBullet key={item} text={item} tone="dark" />
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Areas to Improve</h3>
                  <ul className="mt-2 space-y-3">
                    {[improvements[0], improvements[2]].map((item) => (
                      <FeedbackBullet key={item} text={item} tone="dark" />
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
