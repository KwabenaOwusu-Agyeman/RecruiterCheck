import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { PRICING_PLANS } from '@/lib/constants'
import { useAuth } from '@/hooks/useAuth'
import { createCheckoutSession, createPortalSession } from '@/services/checkService'
import { cn } from '@/utils/cn'

const TIER_RANK: Record<string, number> = {
  free: 0,
  premium_weekly: 1,
  premium_monthly: 2,
}

export function BillingPage() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null)
  const [managingBilling, setManagingBilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkoutStatus = searchParams.get('status')

  async function handleUpgrade(plan: 'premium_weekly' | 'premium_monthly') {
    setLoadingPlan(plan)
    setError(null)

    try {
      const url = await createCheckoutSession(plan)
      window.location.href = url
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

      <div className="mx-auto mt-1 max-w-2xl text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Choose your plan</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Get unlimited checks and tailored application documents when you need them.
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

      {error ? <Alert variant="error" className="mx-auto mt-6 max-w-2xl">{error}</Alert> : null}

      <div className="mt-4 grid gap-6 md:grid-cols-3">
        {PRICING_PLANS.map((plan) => {
          const isCurrent = profile?.subscription_tier === plan.id
          const isPremium = plan.id !== 'free'
          const isHighlighted = Boolean(plan.highlighted)

          // Higher rank = more premium. A plan below the current rank has no
          // supported CTA yet (no downgrade flow exists), so its button is
          // hidden rather than mislabeled as "Upgrade" or invented outright.
          const currentRank = TIER_RANK[profile?.subscription_tier ?? 'free'] ?? 0
          const planRank = TIER_RANK[plan.id] ?? 0
          const isDowngrade = !isCurrent && planRank < currentRank

          return (
            <div key={plan.id} className="relative pt-2.5">
              {plan.badge ? (
                <span
                  className={cn(
                    'absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-4 py-1 text-xs font-semibold tracking-wide shadow-sm',
                    isHighlighted
                      ? 'bg-navy text-white'
                      : 'border border-navy bg-surface text-text-secondary',
                  )}
                >
                  {plan.badge}
                </span>
              ) : null}

              <div
                className={cn(
                  'flex h-full flex-col rounded-2xl border border-navy bg-surface p-2.5',
                  plan.badge ? 'pt-5' : '',
                  isHighlighted ? 'border-2 shadow-lg' : 'shadow-sm',
                )}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <h2 className="text-lg font-semibold text-text-primary">{plan.name}</h2>
                    {isCurrent ? (
                      <span className="rounded-full bg-blue/10 px-2 py-0.5 text-xs font-semibold text-blue">
                        Current
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
                    {plan.price}
                    {plan.interval ? (
                      <span className="text-sm font-normal text-text-secondary"> / {plan.interval}</span>
                    ) : null}
                  </p>
                </div>

                <ul className="mt-2 flex-1 space-y-0.5 text-sm leading-tight text-text-secondary">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 py-0.5">
                      <svg
                        viewBox="0 0 20 20"
                        fill="none"
                        className="mt-0.5 h-4 w-4 shrink-0 text-blue"
                        aria-hidden="true"
                      >
                        <path
                          d="M4 10.5L8 14.5L16 6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-2">
                  {isCurrent && isPremium ? (
                    <Button
                      className="w-full"
                      size="sm"
                      variant="secondary"
                      disabled={managingBilling}
                      onClick={() => void handleManageBilling()}
                    >
                      {managingBilling ? 'Opening...' : 'Manage Billing'}
                    </Button>
                  ) : isCurrent ? (
                    <Button className="w-full" size="sm" variant="secondary" disabled>
                      Current Plan
                    </Button>
                  ) : isDowngrade ? (
                    <div className="h-8" aria-hidden="true" />
                  ) : (
                    <Button
                      className="w-full"
                      size="sm"
                      variant="primary"
                      disabled={loadingPlan !== null}
                      onClick={() =>
                        void handleUpgrade(plan.id as 'premium_weekly' | 'premium_monthly')
                      }
                    >
                      {loadingPlan === plan.id
                        ? 'Redirecting...'
                        : currentRank === 0
                          ? `Choose ${plan.name}`
                          : 'Upgrade'}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

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
    </>
  )
}
