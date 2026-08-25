import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import NumberFlow from '@number-flow/react'
import { motion } from 'motion/react'
import { Alert } from '@/components/ui/Alert'
import { StatusBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { FeedbackBullet, getVerdictColor, splitFinding } from '@/components/feedback/FeedbackBullet'
import { SentimentPrompt } from '@/components/feedback/SentimentPrompt'
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { getResultTone, getScoreLabel } from '@/lib/scoring'
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
 * it needs no new backend field or database column. Returns null below 61
 * ("Not a Fit") since there's nothing constructive to say there.
 */
function buildSummarySentence(score: number, improvements: string[]): string | null {
  const findings = improvements.map((item) => lowerFirstClause(splitFinding(item).title))

  if (score >= 85) {
    return 'Your application is strong and ready to submit as is.'
  }

  if (score >= 61) {
    const [first, second] = findings
    if (first && second) {
      return `Your experience is relevant, but ${first} and ${second} before you apply.`
    }
    if (first) {
      return `Your experience is relevant, but ${first} before you apply.`
    }
    return 'Your experience is relevant, but a few improvements would strengthen your application.'
  }

  return null
}

export function FeedbackPage() {
  usePageMeta({ title: 'Check Results | MyRecruiterCheck', description: 'Your Recruiter Check results.', path: '/checks/results', noindex: true })
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const [check, setCheck] = useState<CheckWithFeedback | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retrying, setRetrying] = useState(false)
  const [documents, setDocuments] = useState<GeneratedDocuments | null>(null)
  const [generatingDocs, setGeneratingDocs] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const tier = profile?.subscription_tier ?? 'free'

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
    trackEvent('recruiter_recommendation_accessed')

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
    return (
      <div className="lg:mx-auto lg:max-w-[1000px]">
        <div className="rounded-[20px] border border-white/10 bg-navy p-4 shadow-elevated sm:p-6 lg:p-8">
          <div className="space-y-3">
            <Skeleton className="h-4 w-24 bg-white/10" />
            <Skeleton className="h-7 w-2/3 bg-white/10" />
            <Skeleton className="h-10 w-40 bg-white/10" />
          </div>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <Skeleton className="h-40 rounded-[16px] bg-white/[0.06]" />
            <Skeleton className="h-40 rounded-[16px] bg-white/[0.06]" />
          </div>
        </div>
      </div>
    )
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
  // A score of 60 or below means "Not a Fit" (see getScoreLabel) — recommending
  // a polished CV draft, cover letter, and recruiter message for a role the
  // candidate's CV doesn't support would be bad advice, not helpful. No tier
  // gets documents below this line; the server enforces the same rule.
  const isLowFit = score !== null && score < 61
  const resultTone = getResultTone(score)
  const isDark = resultTone === 'dark'
  const textTone: 'light' | 'dark' = isDark ? 'dark' : 'light'
  const nestedTone = isDark ? 'nested' : 'nested-light'
  const t = {
    container: isDark ? 'border-white/10 bg-navy' : resultTone === 'muted' ? 'border-border-strong bg-border-soft' : 'border-border-soft bg-surface',
    border: isDark ? 'border-white/10' : 'border-border',
    heading: isDark ? 'text-white' : 'text-text-primary',
    sub: isDark ? 'text-white/75' : 'text-text-secondary',
    subtle: isDark ? 'text-white/65' : 'text-text-secondary',
    faint: isDark ? 'text-white/55' : 'text-text-secondary',
    body: isDark ? 'text-white/85' : 'text-text-secondary',
    accent: isDark ? 'text-blue-light' : 'text-blue',
  }
  const firstName = profile?.full_name?.trim().split(/\s+/)[0]
  const visibleImprovements = feedback
    ? score === 100
      ? []
      : score !== null && score >= 85
        ? feedback.improvements.slice(0, 1)
        : feedback.improvements
    : []
  const visibleProspects = feedback
    ? score === 100
      ? [
          'Your application shows complete documented alignment with this role.',
          'Your application is ready to submit, although employer decisions and competition still apply.',
        ]
      : feedback.prospects
    : []

  return (
    <div className="lg:mx-auto lg:max-w-[1000px]">
      <div className={cn('rounded-[20px] border p-4 shadow-elevated sm:p-6 lg:p-8', t.container)}>
        <div className={cn('border-b pb-5 sm:pb-7', t.border)}>
          <p className={cn('text-sm font-semibold', t.sub)}>
            {firstName ? `Hi ${firstName},` : 'Hi,'}
          </p>
          <h1 className={cn('font-display mt-1 text-2xl font-semibold tracking-tight sm:text-[28px]', t.heading)}>
            {check.job_title || 'Recruiter Feedback'}
          </h1>
          {check.company_name ? (
            <p className={cn('mt-1 text-base font-semibold', t.accent)}>{check.company_name}</p>
          ) : null}
          <div className="mt-2">
            <StatusBadge status={check.status} tone={isDark ? 'dark' : 'light'} />
          </div>

          {score !== null ? (
            <motion.div
              className={cn('mt-5 border-t pt-5', t.border)}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              <p className={cn('text-[2.125rem] font-bold tracking-tight sm:text-[2.625rem]', t.heading)}>
                <NumberFlow value={score} suffix="%" willChange />{' '}
                <span className={cn('text-base font-semibold sm:text-lg', t.subtle)}>
                  Interview Score
                </span>
              </p>
              <p className={cn('mt-2 text-base font-semibold sm:text-lg', getVerdictColor(score, textTone))}>
                {getScoreLabel(score)}
              </p>
              {feedback && buildSummarySentence(score, visibleImprovements) ? (
                <p className={cn('mt-2 max-w-xl text-sm', t.body)}>
                  {buildSummarySentence(score, visibleImprovements)}
                </p>
              ) : null}
              <p className={cn('mt-2 max-w-xl text-xs', t.faint)}>
                Based on the information provided. Hiring decisions and competition may affect the outcome.
              </p>
            </motion.div>
          ) : null}
        </div>

        {check.status === 'failed' ? (
          <Alert variant="error" className="mt-5">
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
          <Alert variant="info" className="mt-5">
            Your check is still being reviewed. Refresh this page in a moment.
          </Alert>
        ) : null}

        {feedback ? (
          <div className="mt-5 space-y-5 sm:mt-7">
            <div className="grid gap-5 md:grid-cols-2">
              {feedback.strengths.length > 0 ? <Card tone={nestedTone}>
                <CardHeader tone={nestedTone} className="px-5 py-3">
                  <h2 className={cn('text-base font-semibold', t.heading)}>Strengths</h2>
                </CardHeader>
                <CardContent className="px-5 py-4">
                  <ul className="space-y-3">
                    {feedback.strengths.map((item) => (
                      <FeedbackBullet key={item} text={item} tone={textTone} />
                    ))}
                  </ul>
                </CardContent>
              </Card> : null}

              <Card tone={nestedTone}>
                <CardHeader tone={nestedTone} className="px-5 py-3">
                  <h2 className={cn('text-base font-semibold', t.heading)}>
                    {score === 100 ? 'Ready to Apply' : 'Areas to Improve'}
                  </h2>
                </CardHeader>
                <CardContent className="px-5 py-4">
                  {visibleImprovements.length > 0 ? (
                    <ul className="space-y-3">
                      {visibleImprovements.map((item) => (
                        <FeedbackBullet key={item} text={item} tone={textTone} />
                      ))}
                    </ul>
                  ) : (
                    <p className={cn('text-sm', t.sub)}>
                      {score === 100
                        ? 'No material improvements identified.'
                        : 'No evidence based improvements identified.'}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {visibleProspects.length > 0 ? <Card tone={nestedTone}>
              <CardHeader tone={nestedTone} className="px-5 py-3">
                <h2 className={cn('text-base font-semibold', t.heading)}>Prospects</h2>
                <p className={cn('mt-0.5 text-xs', t.sub)}>
                  What could improve your chances of getting an interview.
                </p>
              </CardHeader>
              <CardContent className="px-5 py-4">
                <ul className="space-y-2">
                  {visibleProspects.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className={t.accent} aria-hidden="true">
                        •
                      </span>
                      <span className={cn('text-sm leading-snug', t.body)}>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card> : null}

            <Card>
              <CardHeader className="px-5 py-3">
                <h2 className="text-base font-semibold text-text-primary">Recommendation</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  {tier === 'power'
                    ? 'An improved CV draft, cover letter, and recruiter message based on your feedback. Your CV draft may include placeholder figures (e.g. "X%") for areas with no supporting evidence in your CV, and is watermarked as a draft, replace any placeholders with real numbers before submitting.'
                    : 'An improved CV draft based on your feedback. Your CV draft may include placeholder figures (e.g. "X%") for areas with no supporting evidence in your CV, and is watermarked as a draft, replace any placeholders with real numbers before submitting.'}
                </p>
              </CardHeader>
              <CardContent className="px-5 py-4">
                {tier === 'free' || tier === 'starter' ? (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-text-secondary">
                      Your improved CV draft, cover letter, and recruiter message are available on
                      the Active and Power plans.
                    </p>
                    <Link to="/account/billing">
                      <Button size="sm" className="shrink-0">
                        Upgrade
                      </Button>
                    </Link>
                  </div>
                ) : isLowFit ? (
                  <p className="text-sm text-text-secondary">
                    This score suggests the role is not a strong match for your current CV, so we do
                    not generate a CV draft, cover letter, or recruiter message for it. Look for a
                    role that better fits your experience, then run a new Recruiter Check.
                  </p>
                ) : documents ? (
                  <motion.div
                    className="flex flex-wrap gap-2"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                  >
                    <a href={documents.cv} target="_blank" rel="noreferrer">
                      <Button variant="secondary" size="sm">
                        CV.pdf
                      </Button>
                    </a>
                    <p className="w-full basis-full text-xs text-text-secondary">
                      This CV draft is watermarked "Draft, not for submission." Any area we found no
                      supporting evidence for in your CV is marked with a placeholder figure (e.g.
                      "X%"), replace it with your real numbers before sending it.
                    </p>
                    {documents.coverLetter ? (
                      <a href={documents.coverLetter} target="_blank" rel="noreferrer">
                        <Button variant="secondary" size="sm">
                          Cover Letter.pdf
                        </Button>
                      </a>
                    ) : null}
                    {documents.emailForRecruiter ? (
                      <a href={documents.emailForRecruiter} target="_blank" rel="noreferrer">
                        <Button variant="secondary" size="sm">
                          Email for Recruiter.pdf
                        </Button>
                      </a>
                    ) : null}
                    {documents.zip ? (
                      <a href={documents.zip} target="_blank" rel="noreferrer">
                        <Button variant="secondary" size="sm">Download All</Button>
                      </a>
                    ) : null}
                    {tier === 'active' ? (
                      <Link to="/account/billing" className="ml-auto">
                        <Button size="sm">
                          Upgrade
                        </Button>
                      </Link>
                    ) : null}
                  </motion.div>
                ) : (
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-text-secondary">
                      {tier === 'power'
                        ? 'Generate an improved CV draft, cover letter, and recruiter message for this application.'
                        : 'Generate an improved CV draft for this application.'}
                    </p>
                    <Button
                      size="sm"
                      className="shrink-0"
                      disabled={generatingDocs}
                      onClick={() => void handleGenerateDocuments()}
                    >
                      {generatingDocs ? 'Generating...' : 'Generate'}
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

            <SentimentPrompt checkId={check.id} />

          </div>
        ) : check.status === 'completed' ? (
          <Alert variant="info" className="mt-5">Feedback is not available for this check.</Alert>
        ) : null}
      </div>
    </div>
  )
}
