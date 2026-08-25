import { useState } from 'react'
import { ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { BRAND } from '@/lib/constants'
import { submitCheckSentiment } from '@/services/checkService'
import { trackEvent } from '@/lib/analytics'

type Stage = 'ask' | 'positive' | 'negative' | 'done'

/**
 * Sentiment-gated review ask (the monday.com/Notion pattern): only a
 * thumbs-up routes to the public Google review link, so an unhappy user is
 * never sent to leave a public review. Thumbs-down instead offers an
 * optional private note, saved but never surfaced anywhere public.
 */
export function SentimentPrompt({ checkId }: { checkId: string }) {
  const [stage, setStage] = useState<Stage>('ask')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handlePositive() {
    setStage('positive')
    trackEvent('check_sentiment_positive')
    try {
      await submitCheckSentiment(checkId, 'positive')
    } catch {
      // Non-critical — the review ask below doesn't depend on this having saved.
    }
  }

  function handleNegative() {
    setStage('negative')
    trackEvent('check_sentiment_negative')
  }

  async function handleNoteSubmit() {
    setSubmitting(true)
    try {
      await submitCheckSentiment(checkId, 'negative', note)
    } catch {
      // Non-critical — still thank the user even if the save failed.
    } finally {
      setSubmitting(false)
      setStage('done')
    }
  }

  if (stage === 'done') {
    return (
      <Card>
        <CardContent className="px-5 py-4">
          <p className="text-sm text-text-secondary">Thanks for letting us know.</p>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'positive') {
    return (
      <Card>
        <CardContent className="px-5 py-4">
          <p className="text-sm font-semibold text-text-primary">Glad it was helpful!</p>
          <p className="mt-1 text-sm text-text-secondary">
            Would you leave us a quick review on Google? It helps other job seekers find us.
          </p>
          <a href={BRAND.googleReviewUrl} target="_blank" rel="noreferrer">
            <Button size="sm" className="mt-3">Leave a review</Button>
          </a>
        </CardContent>
      </Card>
    )
  }

  if (stage === 'negative') {
    return (
      <Card>
        <CardContent className="px-5 py-4">
          <p className="text-sm font-semibold text-text-primary">Sorry to hear that.</p>
          <p className="mt-1 text-sm text-text-secondary">
            What could we improve? (optional)
          </p>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={2}
            maxLength={500}
            className="mt-2 w-full rounded-[10px] border border-border-soft bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-blue"
            placeholder="Your feedback stays private."
          />
          <div className="mt-3 flex gap-2">
            <Button size="sm" disabled={submitting} onClick={() => void handleNoteSubmit()}>
              {submitting ? 'Sending...' : 'Send'}
            </Button>
            <Button size="sm" variant="secondary" disabled={submitting} onClick={() => setStage('done')}>
              Skip
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 px-5 py-4">
        <p className="text-sm font-semibold text-text-primary">Was this check helpful?</p>
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Yes, this was helpful"
            onClick={() => void handlePositive()}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-text-secondary transition-colors hover:border-blue hover:text-blue"
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="No, this was not helpful"
            onClick={handleNegative}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-text-secondary transition-colors hover:border-blue hover:text-blue"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
