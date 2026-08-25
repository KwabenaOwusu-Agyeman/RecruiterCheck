import { BRAND } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { isTestAccountEmail } from '@/lib/testAccounts'

/**
 * Shown neutrally to every genuine completed check, regardless of score or
 * sentiment (Trustpilot's own guidelines prohibit only inviting happy
 * customers to review) — unlike the sentiment-gated Google review ask in
 * SentimentPrompt. Deliberately a plain small text link, not a card or
 * button, so it never competes visually with the Recommendation/document
 * actions above it.
 */
export function TrustpilotResultsLink({ userEmail }: { userEmail: string | null | undefined }) {
  if (isTestAccountEmail(userEmail)) return null

  return (
    <div className="flex justify-center pt-1">
      <a
        href={BRAND.trustpilotReviewUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackEvent('trustpilot_results_clicked')}
        className="rounded text-xs text-text-secondary underline-offset-2 transition-colors hover:text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue"
      >
        Share your experience on Trustpilot
      </a>
    </div>
  )
}
