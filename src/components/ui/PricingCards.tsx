import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { PricingPlan } from '@/types'
import { cn } from '@/utils/cn'

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  active: 2,
  power: 3,
}

interface PricingCardsProps {
  plans: PricingPlan[]
  currentTier: string
  loadingPlan: string | null
  managingBilling: boolean
  onUpgrade: (planId: 'starter' | 'active' | 'power') => void
  onDowngrade: (planId: 'starter' | 'active' | 'power') => void
  onManageBilling: () => void
}

export function PricingCards({
  plans,
  currentTier,
  loadingPlan,
  managingBilling,
  onUpgrade,
  onDowngrade,
  onManageBilling,
}: PricingCardsProps) {
  const currentRank = TIER_RANK[currentTier] ?? 0

  return (
    <div className="mx-auto mt-3 grid gap-3 md:grid-cols-3">
      {plans.map((plan) => {
        const isCurrent = currentTier === plan.id
        const isHighlighted = Boolean(plan.highlighted)
        const planRank = TIER_RANK[plan.id] ?? 0
        const isDowngrade = !isCurrent && planRank < currentRank

        return (
          <div key={plan.id} className="relative h-full">
            <div
              className={cn(
                'relative flex h-full flex-col rounded-2xl border bg-navy p-4 shadow-elevated transition-transform duration-200 hover:-translate-y-1 sm:p-5',
                isHighlighted ? 'border-blue-light/40' : 'border-white/10',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                {plan.badge ? (
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-light">
                    {plan.badge}
                  </span>
                ) : (
                  // Reserves the same row height as the badge above without
                  // repeating the plan name, which sits right below anyway.
                  <span className="text-xs font-bold uppercase tracking-wider text-transparent" aria-hidden="true">
                    &nbsp;
                  </span>
                )}
                {isCurrent ? (
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white">
                    Current
                  </span>
                ) : null}
              </div>
              <h2 className="font-display mt-1.5 text-xl font-semibold text-white">{plan.name}</h2>
              <p className="mt-1 text-sm leading-snug text-white/60">{plan.description}</p>

              <div className="mt-2.5 border-t border-white/10 pt-2.5">
                <p className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  {plan.price}
                  {plan.interval ? (
                    <span className="text-base font-normal text-white/50">/{plan.interval}</span>
                  ) : null}
                </p>
                {plan.interval ? (
                  <p className="mt-1 text-xs text-white/50">Renews {plan.interval}ly. Cancel anytime.</p>
                ) : null}
              </div>

              <ul className="mt-2.5 flex-1 space-y-1.5 border-t border-white/10 pt-2.5 text-sm text-white/90">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-blue-light" strokeWidth={2.5} />
                    <span className={feature === plan.highlightFeature ? 'font-semibold text-white' : undefined}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3">
                {isCurrent && plan.id !== 'free' ? (
                  <Button
                    variant="light"
                    className="w-full justify-center"
                    size="sm"
                    disabled={managingBilling}
                    onClick={onManageBilling}
                  >
                    {managingBilling ? 'Opening...' : 'Manage Billing'}
                  </Button>
                ) : isCurrent ? (
                  <Button variant="light" className="w-full justify-center" size="sm" disabled>
                    Current Plan
                  </Button>
                ) : isDowngrade ? (
                  <Button
                    variant="ghost"
                    className="w-full justify-center border-white/20 text-white hover:bg-white/10"
                    size="sm"
                    disabled={loadingPlan !== null}
                    onClick={() => onDowngrade(plan.id as 'starter' | 'active' | 'power')}
                  >
                    {loadingPlan === plan.id ? 'Updating...' : 'Downgrade'}
                  </Button>
                ) : (
                  <Button
                    variant="light"
                    className="w-full justify-center gap-2"
                    size="sm"
                    disabled={loadingPlan !== null}
                    onClick={() => onUpgrade(plan.id as 'starter' | 'active' | 'power')}
                  >
                    {loadingPlan === plan.id
                      ? 'Redirecting...'
                      : currentRank === 0
                        ? 'Get Started'
                        : 'Upgrade'}
                    {loadingPlan === plan.id ? null : <ArrowRight className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
