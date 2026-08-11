import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { FeedbackBullet, getVerdictColor, splitFinding } from '@/components/feedback/FeedbackBullet'
import { useAuth } from '@/hooks/useAuth'
import { getScoreLabel } from '@/lib/scoring'
import { trackEvent } from '@/lib/analytics'
import {
  analyzeCheck,
  generateDocuments,
  getCheckWithFeedback,
  type GeneratedDocuments,
} from '@/services/checkService'
import type { CheckWithFeedback } from '@/types'
import { cn } from '@/utils/cn'

function lowerFirstClause(text: string): string {
  const trimmed = text.trim().replace(/[.!?]+$/, '')
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

/**
 * Builds the one-line "why" sentence under the score, entirely from data
 * already on the page (score tier + the two areas-to-improve findings) so
 * it needs no new backend field or database column.
 */
function buildSummarySentence(score: number, improvements: string[]): string {
  const findings = improvements.map((item) => lowerFirstClause(splitFinding(item).title))

  if (score >= 80) {
    return 'Your application is strong and ready to submit as is.'
  }

  if (score >= 50) {
    const [first, second] = findings
    if (first && second) {
      return `Your experience is relevant, but ${first} and ${second} before you apply.`
    }
    if (first) {
      return `Your experience is relevant, but ${first} before you apply.`
    }
    return 'Your experience is relevant, but a few improvements would strengthen your application.'
  }

  const [first] = findings
  return first
    ? `This role is a stretch right now. Focus on ${first} to improve your chances.`
    : 'This role is a stretch right now. A few key improvements would strengthen your chances.'
}

export function FeedbackPage() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [check, setCheck] = useState<CheckWithFeedback | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [documents, setDocuments] = useState<GeneratedDocuments | null>(null)
  const [generatingDocs, setGeneratingDocs] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)

  useEffect(() => {
    async function loadCheck() {
      if (!id) return

      try {
        const data = await getCheckWithFeedback(id)
        if (!data) {
          setError('Check not found')
          return
        }
        setCheck(data)
        if (data.feedback) trackEvent('feedback_viewed')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load feedback')
      } finally {
        setLoading(false)
      }
    }

    void loadCheck()
  }, [id])

  async function handleRetry() {
    if (!id) return
    setRetrying(true)
    setError(null)

    try {
      await analyzeCheck(id)
      const data = await getCheckWithFeedback(id)
      setCheck(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not retry this check')
    } finally {
      setRetrying(false)
    }
  }

  async function handleGenerateDocuments() {
    if (!id) return
    setGeneratingDocs(true)
    setDocumentsError(null)
    trackEvent('recruiter_ready_kit_accessed')

    try {
      const result = await generateDocuments(id)
      setDocuments(result)
    } catch (err) {
      setDocumentsError(err instanceof Error ? err.message : 'Could not generate documents')
    } finally {
      setGeneratingDocs(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-text-secondary">Loading feedback...</p>
  }

  if (error || !check) {
    return (
      <div className="space-y-4">
        <Alert variant="error">{error ?? 'Check not found'}</Alert>
      </div>
    )
  }

  const feedback = check.feedback
  const score = check.interview_probability_score
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]

  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-semibold text-text-primary">
          {firstName ? `Hi ${firstName},` : 'Hi,'}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text-primary">
          {check.job_title || 'Recruiter Feedback'}
        </h1>
        {check.company_name ? (
          <p className="mt-1 text-base font-semibold text-navy">{check.company_name}</p>
        ) : null}
        <div className="mt-2">
          <StatusBadge status={check.status} />
        </div>
      </div>

      {score !== null ? (
        <div className="mb-8">
          <p className="text-4xl font-bold tracking-tight text-navy sm:text-5xl">
            {score}%{' '}
            <span className="text-lg font-semibold text-text-secondary sm:text-xl">
              Interview Probability
            </span>
          </p>
          <p className={cn('mt-2 text-lg font-semibold', getVerdictColor(score))}>
            {getScoreLabel(score)}
          </p>
          {feedback ? (
            <p className="mt-2 max-w-xl text-sm text-text-secondary">
              {buildSummarySentence(score, feedback.improvements)}
            </p>
          ) : null}
        </div>
      ) : null}

      {check.status === 'failed' ? (
        <Alert variant="error" className="mb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{check.error_message ?? 'This check could not be completed.'}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={retrying}
              onClick={() => void handleRetry()}
            >
              {retrying ? 'Retrying...' : 'Retry'}
            </Button>
          </div>
        </Alert>
      ) : null}

      {check.status === 'processing' || check.status === 'draft' ? (
        <Alert variant="info">
          Your check is still being reviewed. Refresh this page in a moment.
        </Alert>
      ) : null}

      {feedback ? (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader className="px-5 py-3">
                <h2 className="text-base font-semibold text-text-primary">Strengths</h2>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <ul className="space-y-3">
                  {feedback.strengths.map((item) => (
                    <FeedbackBullet key={item} text={item} />
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-5 py-3">
                <h2 className="text-base font-semibold text-text-primary">Areas to Improve</h2>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <ul className="space-y-3">
                  {feedback.improvements.map((item) => (
                    <FeedbackBullet key={item} text={item} />
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="px-5 py-3">
              <h2 className="text-base font-semibold text-text-primary">Prospects</h2>
              <p className="mt-0.5 text-xs text-text-secondary">
                What could improve your chances of getting an interview.
              </p>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <ul className="space-y-2">
                {feedback.prospects.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-blue" aria-hidden="true">
                      •
                    </span>
                    <span className="text-sm leading-snug text-text-secondary">{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-5 py-3">
              <h2 className="text-base font-semibold text-text-primary">Recruiter Ready Kit</h2>
              <p className="mt-1 text-xs text-text-secondary">
                A tailored CV, cover letter, and recruiter message based on your feedback.
              </p>
            </CardHeader>
            <CardContent className="px-5 py-4">
              {profile?.subscription_tier === 'free' ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Your tailored CV, cover letter, and recruiter message are available on
                    Premium.
                  </p>
                  <Link to="/account/billing">
                    <Button variant="primary" size="sm" className="shrink-0">
                      Upgrade
                    </Button>
                  </Link>
                </div>
              ) : documents ? (
                <div className="flex flex-wrap gap-2">
                  <a href={documents.cv} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm">
                      CV.pdf
                    </Button>
                  </a>
                  <a href={documents.coverLetter} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm">
                      Cover Letter.pdf
                    </Button>
                  </a>
                  <a href={documents.emailForRecruiter} target="_blank" rel="noreferrer">
                    <Button variant="secondary" size="sm">
                      Email for Recruiter.pdf
                    </Button>
                  </a>
                  <a href={documents.zip} target="_blank" rel="noreferrer">
                    <Button size="sm">Download Package</Button>
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Generate a tailored CV, cover letter, and recruiter message for this
                    application.
                  </p>
                  <Button
                    variant="primary"
                    size="sm"
                    className="shrink-0"
                    disabled={generatingDocs}
                    onClick={() => void handleGenerateDocuments()}
                  >
                    {generatingDocs ? 'Generating...' : 'Generate My Kit'}
                  </Button>
                </div>
              )}
              {documentsError ? (
                <Alert variant="error" className="mt-4">
                  {documentsError}
                </Alert>
              ) : null}
            </CardContent>
          </Card>
        </div>
      ) : check.status === 'completed' ? (
        <Alert variant="info">Feedback is not available for this check.</Alert>
      ) : null}
    </>
  )
}
