import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { ProductFeedbackForm } from '@/features/feedback/components/ProductFeedbackForm'
import { useAuth } from '@/hooks/useAuth'
import { getScoreLabel } from '@/lib/scoring'
import {
  analyzeCheck,
  generateDocuments,
  getCheckWithFeedback,
  type GeneratedDocuments,
} from '@/services/checkService'
import type { CheckWithFeedback } from '@/types'
import { cn } from '@/utils/cn'

function getScoreLabelStyles(score: number): string {
  if (score >= 80) return 'bg-success/10 text-success'
  if (score >= 50) return 'bg-warning/10 text-warning'
  return 'bg-error/10 text-error'
}

export function FeedbackPage() {
  const { id } = useParams<{ id: string }>()
  const { user, profile } = useAuth()
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
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <StatusBadge status={check.status} />
        {score !== null ? (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-blue/20 bg-blue/5 px-3 py-1.5">
              <span className="text-sm font-semibold text-blue">Interview Probability Score</span>
              <span className="text-sm font-bold text-blue">{score}%</span>
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold',
                getScoreLabelStyles(score),
              )}
            >
              {getScoreLabel(score)}
            </span>
          </>
        ) : null}
      </div>

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
        <div className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-text-primary">Strengths</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-text-secondary">
                  {feedback.strengths.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-blue">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-text-primary">Areas to Improve</h2>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-text-secondary">
                  {feedback.improvements.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="text-blue">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-text-primary">Prospects</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-text-secondary">
                {feedback.prospects.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-blue">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-text-primary">Recruiter Ready Kit</h2>
              <p className="mt-1 text-xs text-text-secondary">
                A recruiter tailored CV, cover letter, and email, ready to download and send.
              </p>
            </CardHeader>
            <CardContent>
              {profile?.subscription_tier === 'free' ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-text-secondary">
                    Tailored CV, cover letter, and email for recruiter are available on Premium.
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
                    Generate a recruiter tailored CV, cover letter, and email for this
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

          <p className="text-center text-sm text-text-secondary">
            Good luck with this application. We hope the Recruiter Ready Kit above helps you
            apply with confidence.
          </p>

          {user?.email ? <ProductFeedbackForm userId={user.id} email={user.email} /> : null}
        </div>
      ) : check.status === 'completed' ? (
        <Alert variant="info">Feedback is not available for this check.</Alert>
      ) : null}
    </>
  )
}
