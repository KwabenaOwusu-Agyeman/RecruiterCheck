import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { PricingCards } from '@/components/ui/PricingCards'
import { PRICING_PLANS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import {
  createCheckoutSession,
  createPortalSession,
  FREE_TIER_LIFETIME_LIMIT,
} from '@/services/checkService'

const BILLING_FAQ = [
  {
    question: 'What do I get on the Free plan?',
    answer: `${FREE_TIER_LIFETIME_LIMIT} Recruiter Check, including your Interview Probability and Recruiter Feedback.`,
  },
  {
    question: 'What is the difference between Starter, Active, and Power?',
    answer: 'All plans include your Interview Probability Score and Recruiter Feedback. Active adds an improved CV draft for each check. Power adds the full Recruiter Recommendation, an improved CV draft, cover letter, and recruiter message, plus access to your full check history (Starter and Active only show your most recent check). Documents are only generated for a check scored 61 or above, since a lower score means the role is not a strong match. Every plan\'s check allotment resets weekly with no rollover.',
  },
  {
    question: 'Can I cancel anytime?',
    answer: 'Yes. Manage or cancel your subscription anytime from the billing portal, no notice period required.',
  },
  {
    question: 'Is my payment information secure?',
    answer: 'Payments are processed securely by Stripe. We never see or store your card details.',
  },
] as const

export function BillingPage() {
  const { profile, refreshProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planUpdated, setPlanUpdated] = useState(false)

  const checkoutStatus = searchParams.get('status')

  useEffect(() => {
    // A brand new subscriber lands here after a Stripe Checkout redirect —
    // the webhook writes their tier, but this tab's `profile` was loaded
    // before that happened, so it must be re-fetched or the rest of the
    // session keeps showing stale (pre-upgrade) limits until a hard reload.
    if (checkoutStatus === 'success') {
      trackEvent('subscription_completed')
      void refreshProfile()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutStatus])

  async function handleUpgrade(plan: 'starter' | 'active' | 'power') {
    setLoadingPlan(plan)
    setError(null)
    setPlanUpdated(false)
    trackEvent('upgrade_started')

    try {
      const result = await createCheckoutSession(plan)
      if (result.kind === 'redirect') {
        window.location.href = result.url
        return
      }
      // Already-subscribed user switching plans: the existing subscription
      // was modified in place server-side, not a new Checkout session, so
      // there's nothing to redirect to — just pick up the new tier.
      await refreshProfile()
      trackEvent('subscription_completed')
      setPlanUpdated(true)
      setLoadingPlan(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start checkout')
      setLoadingPlan(null)
    }
  }

  async function handleManageBilling() {
    setManagingBilling(true)
    setError(null)

    try {
      const url = await createPortalSession()
      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open billing portal')
      setManagingBilling(false)
    }
  }

  return (
    <>
      <BackLink to="/account" />

      <div className="mx-auto mt-1 max-w-2xl text-center lg:max-w-[1080px]">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-[30px]">
          Choose your plan
        </h1>
        <p className="mt-2 text-sm text-text-secondary sm:text-base">
          Get more Recruiter Checks and tailored application documents when you need them.
        </p>
      </div>

      {checkoutStatus === 'success' ? (
        <Alert variant="success" className="mx-auto mt-6 max-w-2xl">
          Payment received. Your plan will update shortly.
        </Alert>
      ) : null}

      {checkoutStatus === 'cancelled' ? (
        <Alert variant="info" className="mx-auto mt-6 max-w-2xl">
          Checkout was cancelled. No changes were made.
        </Alert>
      ) : null}

      {planUpdated ? (
        <Alert variant="success" className="mx-auto mt-6 max-w-2xl">
          Your plan has been updated.
        </Alert>
      ) : null}

      {error ? <Alert variant="error" className="mx-auto mt-6 max-w-2xl">{error}</Alert> : null}

      <PricingCards
        plans={PRICING_PLANS.filter((plan) => plan.id !== 'free')}
        currentTier={profile?.subscription_tier ?? 'free'}
        loadingPlan={loadingPlan}
        managingBilling={managingBilling}
        onUpgrade={(planId) => void handleUpgrade(planId)}
        onManageBilling={() => void handleManageBilling()}
      />

      <div className="mt-6 flex flex-col items-center gap-1.5 text-center text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
            <path
              d="M5 9V6.5a5 5 0 0 1 10 0V9m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Payments securely processed by Stripe. We never see or store your card details.</span>
        </div>
        <span>Cancel anytime from your billing portal.</span>
      </div>

      <div className="mx-auto mt-10 max-w-2xl lg:max-w-[720px]">
        <h2 className="text-center text-lg font-semibold text-text-primary sm:text-xl">Billing FAQ</h2>
        <div className="mt-4 divide-y divide-border rounded-[16px] border border-border-soft bg-surface shadow-card">
          {BILLING_FAQ.map(({ question, answer }) => (
            <div key={question} className="px-5 py-4">
              <p className="text-sm font-semibold text-text-primary">{question}</p>
              <p className="mt-1 text-sm text-text-secondary">{answer}</p>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
