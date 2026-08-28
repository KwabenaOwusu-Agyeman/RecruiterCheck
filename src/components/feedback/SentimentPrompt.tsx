import { useEffect, useState } from 'react'
import { Star, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { useAuth } from '@/hooks/useAuth'
import { hasSubmittedTestimonial, submitCheckSentiment, submitFeatureTestimonial } from '@/services/checkService'
import { trackEvent } from '@/lib/analytics'
import { cn } from '@/utils/cn'

function StarRatingInput({ rating, onChange }: { rating: number; onChange: (value: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {Array.from({ length: 5 }, (_, index) => {
        const value = index + 1
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            onClick={() => onChange(value)}
            className="p-0.5"
          >
            <Star
              className={cn('h-5 w-5', value <= rating ? 'fill-warning text-warning' : 'fill-border-strong text-border-strong')}
            />
          </button>
        )
      })}
    </div>
  )
}

type Stage = 'ask' | 'positive' | 'negative' | 'done'
type TestimonialStage = 'idle' | 'submitting' | 'submitted' | 'error'

/**
 * Sentiment-gated review ask: thumbs-up leads straight into an explicit-
 * consent testimonial capture (the only path that writes to
 * public.product_feedback with feature_consent true, see
 * submitFeatureTestimonial), since thumbs-up is the one moment we know the
 * user is actually happy, and nothing else in the product collects this for
 * the landing page's TestimonialsSection. Thumbs-down instead offers an
 * optional private note, saved but never surfaced anywhere public.
 */
export function SentimentPrompt({ checkId, jobTitle }: { checkId: string; jobTitle?: string | null }) {
  const { profile } = useAuth()
  const [stage, setStage] = useState<Stage>('ask')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const [testimonialStage, setTestimonialStage] = useState<TestimonialStage>('idle')
  const [testimonialComment, setTestimonialComment] = useState('')
  const [testimonialName, setTestimonialName] = useState('')
  const [testimonialRating, setTestimonialRating] = useState(5)
  const [testimonialConsent, setTestimonialConsent] = useState(false)

  // The table allows exactly one product_feedback row per user, so
  // resubmitting on a later check would silently overwrite their first
  // public testimonial rather than adding a new one — once they already
  // have one on file, skip asking again instead of re-prompting on every
  // subsequent check. Starts true (not false) so the form doesn't flash
  // into view for an instant before this resolves.
  const [alreadyHasTestimonial, setAlreadyHasTestimonial] = useState(true)
  useEffect(() => {
    hasSubmittedTestimonial()
      .then(setAlreadyHasTestimonial)
      .catch(() => setAlreadyHasTestimonial(false))
  }, [])

  // Pre-fills from the account's own name (real, self-reported at signup —
  // same source FeedbackPage's "Hi {firstName}" greeting uses) so the user
  // isn't asked to retype it, while staying editable in case they'd rather
  // publish a shortened form (e.g. "Amara O.") for privacy.
  useEffect(() => {
    if (profile?.full_name) setTestimonialName((current) => current || profile.full_name!)
  }, [profile?.full_name])

  async function handlePositive() {
    setStage('positive')
    trackEvent('check_sentiment_positive')
    try {
      await submitCheckSentiment(checkId, 'positive')
    } catch {
      // Non-critical — the review ask below doesn't depend on this having saved.
    }
  }

  async function handleTestimonialSubmit() {
    setTestimonialStage('submitting')
    try {
      await submitFeatureTestimonial({
        checkId,
        rating: testimonialRating,
        comment: testimonialComment,
        displayName: testimonialName,
        targetRole: jobTitle,
      })
      trackEvent('testimonial_submitted')
      setTestimonialStage('submitted')
    } catch {
      setTestimonialStage('error')
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
          {testimonialStage === 'submitted' ? (
            <p className="mt-1 text-sm text-text-secondary">Thanks, we may feature this on our site.</p>
          ) : alreadyHasTestimonial ? (
            <p className="mt-1 text-sm text-text-secondary">Thanks for already sharing your experience with us.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-text-secondary">Share your experience</p>
              <div className="mt-3">
                <StarRatingInput rating={testimonialRating} onChange={setTestimonialRating} />
              </div>
              <textarea
                value={testimonialComment}
                onChange={(event) => setTestimonialComment(event.target.value)}
                rows={2}
                maxLength={400}
                disabled={testimonialStage === 'submitting'}
                className="mt-2 w-full rounded-[10px] border border-border-soft bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-blue"
                placeholder="What was useful about your check?"
              />
              <input
                type="text"
                value={testimonialName}
                onChange={(event) => setTestimonialName(event.target.value)}
                maxLength={80}
                disabled={testimonialStage === 'submitting'}
                className="mt-2 w-full rounded-[10px] border border-border-soft bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-blue"
                placeholder="Name to show alongside your quote"
                aria-label="Name to show alongside your quote"
              />
              {profile?.full_name ? (
                <p className="mt-1 text-xs text-text-secondary">
                  Taken from your account — edit it if you'd rather show a shortened version.
                </p>
              ) : null}
              {testimonialStage === 'error' ? (
                <p className="mt-2 text-xs text-error">Could not save that, please try again.</p>
              ) : null}
              <label className="mt-3 flex items-start gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={testimonialConsent}
                  onChange={(event) => setTestimonialConsent(event.target.checked)}
                  disabled={testimonialStage === 'submitting'}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border-strong text-blue focus:ring-blue"
                />
                <span>
                  I agree that MyRecruiterCheck can publish my name, the role I checked, and this
                  quote on myrecruitercheck.com.
                </span>
              </label>
              <Button
                size="sm"
                className="mt-3"
                disabled={
                  testimonialStage === 'submitting' ||
                  !testimonialComment.trim() ||
                  !testimonialName.trim() ||
                  !testimonialConsent
                }
                onClick={() => void handleTestimonialSubmit()}
              >
                {testimonialStage === 'submitting' ? 'Sharing...' : 'Share'}
              </Button>
            </>
          )}
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
