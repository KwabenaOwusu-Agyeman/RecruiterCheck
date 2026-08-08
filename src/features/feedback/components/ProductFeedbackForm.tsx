import { useEffect, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { getProductFeedback, submitProductFeedback } from '@/services/checkService'
import { cn } from '@/utils/cn'

interface ProductFeedbackFormProps {
  userId: string
  email: string
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
            className="p-0.5"
          >
            <svg
              viewBox="0 0 20 20"
              className={cn('h-6 w-6', value <= rating ? 'fill-warning' : 'fill-border')}
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

export function ProductFeedbackForm({ userId, email }: ProductFeedbackFormProps) {
  const [checking, setChecking] = useState(true)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
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
      await submitProductFeedback(userId, email, rating, comment)
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit your feedback')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking || alreadySubmitted) return null

  if (submitted) {
    return (
      <div className="rounded-xl border border-navy bg-surface p-6 text-center">
        <p className="text-sm font-semibold text-text-primary">Thanks for your feedback!</p>
        <p className="mt-1 text-sm text-text-secondary">
          It helps us make RecruiterCheck better.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-navy bg-surface p-6">
      <h2 className="text-base font-semibold text-text-primary">How was your experience?</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Rate RecruiterCheck and leave a comment if you like. This only takes a moment.
      </p>

      <div className="mt-4">
        <StarInput rating={rating} onChange={setRating} />
      </div>

      <Textarea
        className="mt-4 min-h-[100px]"
        placeholder="Any comments? (optional)"
        value={comment}
        onChange={(event) => setComment(event.target.value)}
      />

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
        {submitting ? 'Submitting...' : 'Submit Feedback'}
      </Button>
    </div>
  )
}
