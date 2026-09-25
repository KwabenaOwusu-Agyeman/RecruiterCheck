import { useRef, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader } from '@/components/ui/Card'
import { Textarea } from '@/components/ui/Textarea'
import {
  answerProblem,
  canSubmitAnswer,
  createSubmissionGuard,
  CANDIDATE_REPORTED_LABEL,
  FOLLOW_UP_EXPLANATION,
  FOLLOW_UP_HEADING,
  FOLLOW_UP_OPTIONAL_NOTE,
  FOLLOW_UP_SUBMIT_LABEL,
  FOLLOW_UP_SUBMITTING_LABEL,
  FOLLOW_UP_WORKING_MESSAGE,
  MAX_ANSWER_CHARS,
} from '@/lib/evidenceFollowUp'
import { submitEvidenceFollowUp } from '@/services/checkService'
import { trackEvent } from '@/lib/analytics'
import type { EvidenceFollowUp } from '@/types'
import { cn } from '@/utils/cn'

interface EvidenceFollowUpCardProps {
  followUp: EvidenceFollowUp
  // Follows the results container: navy while there is work to do, otherwise light.
  dark: boolean
  onAssessed: (followUp: EvidenceFollowUp) => void
}

/**
 * Gap Analysis: the single most important gap, one question about it and one
 * answer box. Answering is optional and never nagged; skipping leaves the row
 * pending. Shown only while the original CV exists (see canAnswer), and once
 * assessed it shows the answer, labelled candidate reported, and what changed,
 * never a score: the report above has one.
 */
export function EvidenceFollowUpCard({ followUp, dark, onAssessed }: EvidenceFollowUpCardProps) {
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // One submission at a time, even for two clicks in the same frame.
  const guard = useRef(createSubmissionGuard())

  const cardTone = dark ? 'nested' : 'nested-light'
  const c = {
    heading: dark ? 'text-white' : 'text-text-primary',
    faint: dark ? 'text-white/65' : 'text-text-secondary',
    body: dark ? 'text-white/85' : 'text-text-secondary',
    accent: dark ? 'text-blue-light' : 'text-blue',
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

  const explanation = (
    <div>
      <p className={cn('text-sm leading-snug', c.body)}>{FOLLOW_UP_EXPLANATION}</p>
      <p className={cn('mt-1 text-sm font-semibold leading-snug', c.heading)}>{followUp.gap_requirement}</p>
    </div>
  )

  if (followUp.status === 'assessed') {
    return (
      <Card tone={cardTone}>
        <CardHeader tone={cardTone} className="px-5 py-3">
          <h2 className={cn('text-base font-semibold', c.heading)}>{FOLLOW_UP_HEADING}</h2>
        </CardHeader>
        <CardContent className="space-y-4 px-5 py-4">
          {explanation}
          {followUp.candidate_answer ? (
            <div>
              <p className={cn('text-xs font-semibold', c.accent)}>{CANDIDATE_REPORTED_LABEL}</p>
              <p className={cn('mt-1 whitespace-pre-line text-sm italic leading-snug', c.body)}>
                &quot;{followUp.candidate_answer}&quot;
              </p>
            </div>
          ) : null}
          {followUp.what_changed.length > 0 ? (
            <ul className="space-y-2">
              {followUp.what_changed.map((line) => (
                <li key={line} className="flex gap-2">
                  <span className={c.accent} aria-hidden="true">
                    •
                  </span>
                  <span className={cn('text-sm leading-snug', c.body)}>{line}</span>
                </li>
              ))}
            </ul>
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
        <h2 className={cn('text-xl font-semibold', c.heading)}>{FOLLOW_UP_HEADING}</h2>
      </CardHeader>
      <CardContent className="space-y-4 px-5 py-4">
        {explanation}

        <div>
          <label htmlFor="evidence-follow-up-answer" className={cn('block text-sm leading-snug', c.heading)}>
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
        </div>

        {error ? <Alert variant="error">{error}</Alert> : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p id="evidence-follow-up-note" className={cn('text-xs', c.faint)} role="status" aria-live="polite">
            {submitting ? FOLLOW_UP_WORKING_MESSAGE : FOLLOW_UP_OPTIONAL_NOTE}
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
