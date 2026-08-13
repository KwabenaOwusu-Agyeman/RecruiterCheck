import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { getProductFeedback, submitProductFeedback } from '@/services/checkService'
import { trackEvent } from '@/lib/analytics'
import { BRAND } from '@/lib/constants'
import { cn } from '@/utils/cn'

interface ProductFeedbackFormProps {
  userId: string
  email: string
  checkId: string
  firstName: string | null
  targetRole: string | null
}

function StarInput({ rating, onChange }: { rating: number; onChange: (value: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {Array.from({ length: 5 }).map((_, index) => {
        const value = index + 1
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? '' : 's'}`}
            onClick={() => onChange(value)}
            className="p-1"
          >
            <svg
              viewBox="0 0 20 20"
              className={cn('h-7 w-7', value <= rating ? 'fill-warning' : 'fill-border')}
              aria-hidden="true"
            >
              <path d="M10 1.5l2.59 5.25 5.79.84-4.19 4.08.99 5.77L10 14.77l-5.18 2.67.99-5.77L1.62 7.59l5.79-.84L10 1.5z" />
            </svg>
          </button>
        )
      })}
    </div>
  )
}

export function ProductFeedbackForm({ userId, email, checkId, firstName, targetRole }: ProductFeedbackFormProps) {
  const [checking, setChecking] = useState(true)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [featureConsent, setFeatureConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [shareMessage, setShareMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    void getProductFeedback(userId)
      .then((existing) => {
        if (!cancelled) setAlreadySubmitted(Boolean(existing))
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId])

  async function handleSubmit() {
    if (rating === 0) {
      setError('Please select a star rating.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const canFeature = Boolean(comment.trim()) && Boolean(firstName)
      await submitProductFeedback(
        userId,
        email,
        checkId,
        firstName,
        targetRole,
        rating,
        comment,
        featureConsent && canFeature,
      )
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your feedback')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleShare() {
    const shareData = {
      title: BRAND.name,
      text: 'Before you apply, check how a recruiter may see your CV.',
      url: BRAND.canonicalUrl,
    }

    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setShareMessage('Thanks for sharing.')
      } else {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`)
        setShareMessage('Link copied.')
      }
      trackEvent('referral_shared')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setShareMessage('Could not share the link. Please try again.')
    }
  }

  if (checking || alreadySubmitted) return null

  if (submitted) {
    return (
      <div className="rounded-2xl border border-navy bg-surface sm:rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-text-primary">Thanks for your feedback.</p>
        <p className="mt-1 text-sm text-text-secondary">It helps us improve MyRecruiterCheck.</p>
        {rating >= 4 ? (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-base font-semibold text-text-primary">Know someone applying for jobs?</p>
            <p className="mt-1 text-sm text-text-secondary">
              Help them think like a recruiter before they apply.
            </p>
            <Button size="sm" className="mt-3" onClick={() => void handleShare()}>
              Share
            </Button>
            {shareMessage ? <p className="mt-2 text-xs text-text-secondary" role="status">{shareMessage}</p> : null}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-navy bg-surface sm:rounded-xl p-6">
      <h2 className="text-base font-semibold text-text-primary">How useful was your Recruiter Check?</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Your answer helps us improve future Recruiter Checks.
      </p>

      <div className="mt-4">
        <StarInput rating={rating} onChange={setRating} />
      </div>

      <Textarea
        className="mt-4 min-h-[100px]"
        placeholder="What helped most? (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />
      {comment.trim() && firstName ? (
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-4 text-text-secondary">
          <input
            type="checkbox"
            checked={featureConsent}
            onChange={(event) => setFeatureConsent(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
          />
          <span>
            I agree that MyRecruiterCheck may publish my feedback, first name and job title on its
            website and social media. I can withdraw permission at any time.
          </span>
        </label>
      ) : (
        <p className="mt-2 text-xs text-text-secondary">Your response stays private.</p>
      )}

      {error ? (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      ) : null}

      <Button
        size="sm"
        className="mt-4"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Sending...' : 'Send Feedback'}
      </Button>
    </div>
  )
}
