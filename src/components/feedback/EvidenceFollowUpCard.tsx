import { useRef, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import { FeedbackBullet } from '@/components/feedback/FeedbackBullet'
import { getVerdictColor } from '@/components/feedback/verdictColor'
import { FICTIONAL_SAMPLE_NOTICE, hasSampleWording } from '@/lib/feedbackText'
import { getScoreLabel, sanitizeScore } from '@/lib/scoring'
import {
  answerProblem,
  canSubmitAnswer,
  createSubmissionGuard,
  CANDIDATE_REPORTED_LABEL,
  FINAL_SCORE_LABEL,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_INTEGRITY_NOTE,
  FOLLOW_UP_INTRO,
  FOLLOW_UP_OPTIONAL_NOTE,
  FOLLOW_UP_SUBMIT_LABEL,
  FOLLOW_UP_SUBMITTING_LABEL,
  FOLLOW_UP_WORKING_MESSAGE,
  INITIAL_SCORE_LABEL,
  MAX_ANSWER_CHARS,
} from '@/lib/evidenceFollowUp'
import { submitEvidenceFollowUp } from '@/services/checkService'
import { trackEvent } from '@/lib/analytics'
import type { EvidenceFollowUp } from '@/types'
import { cn } from '@/utils/cn'

interface EvidenceFollowUpCardProps {
  followUp: EvidenceFollowUp
  // The check's own score, unchanged. Always shown beside the final one.
  initialScore: number | null
  // Follows the results container: navy while there is work to do, otherwise light.
  dark: boolean
  onAssessed: (followUp: EvidenceFollowUp) => void
}

/**
 * The optional Evidence Follow Up. Sits below the initial results as part of
 * the same Recruiter Check, not a chat: one question, one text box, one
 * button. Answering is optional and never nagged; skipping leaves the row
 * pending and this card simply stays as it is.
 *
 * The card only ever appears for a check that has a follow up row, and the
 * form only while the original CV still exists (see canAnswer). Once
 * assessed it shows the final score beside, never in place of, the initial
 * one, and labels everything drawn from the answer as candidate reported.
 */
export function EvidenceFollowUpCard({ followUp, initialScore, dark, onAssessed }: EvidenceFollowUpCardProps) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One submission at a time, even for two clicks in the same frame.
  const guard = useRef(createSubmissionGuard())

  const tone: 'light' | 'dark' = dark ? 'dark' : 'light'
  const cardTone = dark ? 'nested' : 'nested-light'
  const c = {
    heading: dark ? 'text-white' : 'text-text-primary',
    sub: dark ? 'text-white/75' : 'text-text-secondary',
    faint: dark ? 'text-white/65' : 'text-text-secondary',
    body: dark ? 'text-white/85' : 'text-text-secondary',
    accent: dark ? 'text-blue-light' : 'text-blue',
    rule: dark ? 'border-white/10' : 'border-border',
  }

  async function handleSubmit() {
    if (!canSubmitAnswer(answer)) return
    setSubmitting(true)
    setError(null)
    const outcome = await guard.current(async () => {
      trackEvent('evidence_follow_up_submitted')
      return submitEvidenceFollowUp(followUp.check_id, answer.trim())
    })
    if (outcome.status === 'busy') return
    setSubmitting(false)
    if (outcome.status === 'error') {
      // The initial result is untouched. The answer stays in the box so the
      // candidate can retry without retyping it.
      setError(outcome.message)
      return
    }
    trackEvent('evidence_follow_up_assessed')
    onAssessed(outcome.value)
  }

  if (followUp.status === 'assessed') {
    const finalScore = sanitizeScore(followUp.final_score)
    if (finalScore === null) return null
    const initial = sanitizeScore(initialScore)
    const improvements = followUp.final_improvements
    return (
      <Card tone={cardTone} className="overflow-hidden">
        <CardHeader tone={cardTone} className="px-5 py-3">
          <h2 className={cn('text-base font-semibold', c.heading)}>{FINAL_SCORE_LABEL}</h2>
          <p className={cn('mt-0.5 text-xs', c.sub)}>
            Reassessed once with your answer. Your initial result above is unchanged.
          </p>
        </CardHeader>
        <CardContent className="space-y-5 px-5 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {initial !== null ? (
              <div>
                <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>{INITIAL_SCORE_LABEL}</p>
                <p className={cn('mt-1 text-2xl font-semibold tracking-[-0.02em]', c.heading)}>{initial}%</p>
                <p className={cn('text-sm font-semibold', getVerdictColor(initial, tone))}>{getScoreLabel(initial)}</p>
              </div>
            ) : null}
            <div>
              <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>{FINAL_SCORE_LABEL}</p>
              <p className={cn('mt-1 text-2xl font-semibold tracking-[-0.02em]', c.heading)}>{finalScore}%</p>
              <p className={cn('text-sm font-semibold', getVerdictColor(finalScore, tone))}>{getScoreLabel(finalScore)}</p>
            </div>
          </div>

          {followUp.what_changed.length > 0 ? (
            <div className={cn('border-t pt-4', c.rule)}>
              <h3 className={cn('text-sm font-semibold', c.heading)}>What changed</h3>
              <ul className="mt-2 space-y-2">
                {followUp.what_changed.map((line) => (
                  <li key={line} className="flex gap-2">
                    <span className={c.accent} aria-hidden="true">
                      •
                    </span>
                    <span className={cn('text-sm leading-snug', c.body)}>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {followUp.candidate_answer ? (
            <div className={cn('border-t pt-4', c.rule)}>
              <p className={cn('text-xs font-semibold', c.accent)}>{CANDIDATE_REPORTED_LABEL}</p>
              <p className={cn('mt-1 whitespace-pre-line text-sm italic leading-snug', c.body)}>
                &quot;{followUp.candidate_answer}&quot;
              </p>
            </div>
          ) : null}

          {followUp.final_strengths.length > 0 || improvements.length > 0 ? (
            <div className={cn('grid gap-5 border-t pt-4 md:grid-cols-2', c.rule)}>
              {followUp.final_strengths.length > 0 ? (
                <div>
                  <h3 className={cn('text-sm font-semibold', c.heading)}>Updated strengths</h3>
                  <ul className="mt-2 space-y-3">
                    {followUp.final_strengths.map((item) => (
                      <FeedbackBullet key={item} text={item} tone={tone} />
                    ))}
                  </ul>
                </div>
              ) : null}
              {improvements.length > 0 ? (
                <div>
                  <h3 className={cn('text-sm font-semibold', c.heading)}>Updated areas to improve</h3>
                  {improvements.some(hasSampleWording) ? (
                    <p className={cn('mt-1 text-xs leading-snug', c.faint)}>{FICTIONAL_SAMPLE_NOTICE}</p>
                  ) : null}
                  <ul className="mt-2 space-y-3">
                    {improvements.map((item) => (
                      <FeedbackBullet key={item} text={item} tone={tone} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    )
  }

  // Unanswered, and the original CV is gone: nothing to offer.
  if (!followUp.canAnswer) return null

  const problem = answer.trim().length > 0 ? answerProblem(answer) : null

  return (
    <Card tone={cardTone}>
      <CardHeader tone={cardTone} className="px-5 py-3">
        <h2 className={cn('text-base font-semibold', c.heading)}>{FOLLOW_UP_HEADING}</h2>
        <p className={cn('mt-0.5 text-xs', c.sub)}>{FOLLOW_UP_OPTIONAL_NOTE}</p>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4">
        <div>
          <p className={cn('text-xs font-medium uppercase tracking-wider', c.faint)}>{FOLLOW_UP_INTRO}</p>
          <p className={cn('mt-1 text-sm leading-snug', c.body)}>{followUp.gap_summary}</p>
        </div>

        <div>
          <label htmlFor="evidence-follow-up-answer" className={cn('block text-sm font-semibold leading-snug', c.heading)}>
            {followUp.question}
          </label>
          <Textarea
            id="evidence-follow-up-answer"
            className="mt-2 min-h-[120px]"
            value={answer}
            maxLength={MAX_ANSWER_CHARS}
            disabled={submitting}
            onChange={(event) => setAnswer(event.target.value)}
            aria-describedby="evidence-follow-up-note"
            aria-invalid={problem !== null}
          />
          {problem ? <p className={cn('mt-1 text-xs', c.faint)}>{problem}</p> : null}
          <p id="evidence-follow-up-note" className={cn('mt-2 text-xs leading-snug', c.faint)}>
            {FOLLOW_UP_INTEGRITY_NOTE}
          </p>
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={cn('text-xs', c.faint)} role="status" aria-live="polite">
            {submitting ? FOLLOW_UP_WORKING_MESSAGE : ''}
          </p>
          <Button
            size="sm"
            variant={dark ? 'light' : 'primary'}
            className="shrink-0"
            disabled={submitting || !canSubmitAnswer(answer)}
            onClick={() => void handleSubmit()}
          >
            {submitting ? FOLLOW_UP_SUBMITTING_LABEL : error ? 'Try again' : FOLLOW_UP_SUBMIT_LABEL}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
