import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { PricingCards } from '@/components/ui/PricingCards'
import { PRICING_PLANS } from '@/lib/constants'
import { trackEvent } from '@/lib/analytics'
import { useAuth } from '@/hooks/useAuth'
import { usePageMeta } from '@/hooks/usePageMeta'
import { createCheckoutSession, createPortalSession } from '@/services/checkService'

export function BillingPage() {
  usePageMeta({ title: 'Billing | MyRecruiterCheck', description: 'Manage your MyRecruiterCheck subscription and billing.', path: '/account/billing', noindex: true })
  const { profile, refreshProfile } = useAuth()
  const [searchParams] = useSearchParams()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [planUpdated, setPlanUpdated] = useState(false)
  const [downgradeTarget, setDowngradeTarget] = useState<'starter' | 'active' | 'power' | null>(null)

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

  async function switchPlan(plan: 'starter' | 'active' | 'power') {
    setLoadingPlan(plan)
    setError(null)
    setPlanUpdated(false)

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

  function handleUpgrade(plan: 'starter' | 'active' | 'power') {
    trackEvent('upgrade_started')
    void switchPlan(plan)
  }

  function handleDowngrade(plan: 'starter' | 'active' | 'power') {
    setDowngradeTarget(plan)
  }

  async function confirmDowngrade() {
    if (!downgradeTarget) return
    trackEvent('downgrade_started')
    const plan = downgradeTarget
    setDowngradeTarget(null)
    await switchPlan(plan)
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
        <p className="text-xs font-bold uppercase tracking-wider text-blue">Recruiter Check Plans</p>
        <h1 className="font-display mt-1.5 text-2xl font-bold tracking-tight text-text-primary sm:text-[32px]">
          Choose your plan
        </h1>
        <p className="mx-auto mt-2 max-w-none text-sm text-text-secondary sm:whitespace-nowrap sm:text-base">
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
        onUpgrade={handleUpgrade}
        onDowngrade={handleDowngrade}
        onManageBilling={() => void handleManageBilling()}
      />

      <ConfirmDialog
        open={downgradeTarget !== null}
        title="Downgrade plan?"
        description={
          downgradeTarget
            ? `You'll move to ${PRICING_PLANS.find((plan) => plan.id === downgradeTarget)?.name} right away, with a prorated credit for the time remaining on your current plan. Your check allotment will drop to match the new plan immediately.`
            : null
        }
        confirmLabel="Downgrade"
        confirmingLabel="Updating..."
        cancelLabel="Keep current plan"
        busy={loadingPlan !== null}
        destructive={false}
        onConfirm={() => void confirmDowngrade()}
        onCancel={() => setDowngradeTarget(null)}
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
        <span>
          Have questions?{' '}
          <Link to="/faq" className="font-medium text-blue hover:underline">
            Read the FAQ
          </Link>
        </span>
      </div>
    </>
  )
}
