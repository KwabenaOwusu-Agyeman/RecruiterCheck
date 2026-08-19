import { useRef } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import type { Variants } from 'motion/react'
import { Button } from '@/components/ui/Button'
import { TimelineContent } from '@/components/ui/timeline-animation'
import type { PricingPlan } from '@/types'
import { cn } from '@/utils/cn'

const TIER_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  active: 2,
  power: 3,
}

const revealVariants: Variants = {
  visible: (i: number) => ({
    y: 0,
    opacity: 1,
    filter: 'blur(0px)',
    transition: { delay: i * 0.1, duration: 0.4 },
  }),
  hidden: { y: 16, opacity: 0, filter: 'blur(6px)' },
}

interface PricingCardsProps {
  plans: PricingPlan[]
  currentTier: string
  loadingPlan: string | null
  managingBilling: boolean
  onUpgrade: (planId: 'starter' | 'active' | 'power') => void
  onManageBilling: () => void
}

export function PricingCards({
  plans,
  currentTier,
  loadingPlan,
  managingBilling,
  onUpgrade,
  onManageBilling,
}: PricingCardsProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const currentRank = TIER_RANK[currentTier] ?? 0

  return (
    <div ref={gridRef} className="mx-auto mt-4 grid gap-4 md:grid-cols-3 lg:max-w-[1080px]">
      {plans.map((plan, index) => {
        const isCurrent = currentTier === plan.id
        const isHighlighted = Boolean(plan.highlighted)
        const planRank = TIER_RANK[plan.id] ?? 0
        const isDowngrade = !isCurrent && planRank < currentRank

        return (
          <TimelineContent
            key={plan.id}
            as="div"
            animationNum={index}
            timelineRef={gridRef}
            customVariants={revealVariants}
            className="relative h-full"
          >
            <div
              className={cn(
                'relative flex h-full flex-col rounded-2xl border bg-surface p-4 transition-transform duration-200 hover:-translate-y-1',
                isHighlighted ? 'border-2 border-navy shadow-elevated bg-navy-tint' : 'border-border-soft shadow-card',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-text-primary">{plan.name}</h2>
                  {isCurrent ? (
                    <span className="rounded-full bg-blue/10 px-2 py-0.5 text-xs font-semibold text-blue">
                      Current
                    </span>
                  ) : null}
                </div>
                {plan.badge ? (
                  <span
                    className={cn(
                      'shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
                      isHighlighted
                        ? 'bg-navy text-white'
                        : 'border border-border-strong bg-surface text-text-secondary',
                    )}
                  >
                    {plan.badge}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm leading-snug text-text-secondary">{plan.description}</p>

              <p className="mt-2 text-4xl font-bold tracking-tight text-text-primary">
                {plan.price}
                {plan.interval ? (
                  <span className="text-base font-normal text-text-secondary">/{plan.interval}</span>
                ) : null}
              </p>

              <ul className="mt-2 flex-1 space-y-2 text-sm text-text-secondary">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0 text-blue" strokeWidth={2.5} />
                    <span className={feature === plan.highlightFeature ? 'font-semibold text-text-primary' : undefined}>
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3">
                {isCurrent && plan.id !== 'free' ? (
                  <Button
                    className="w-full justify-center"
                    size="sm"
                    variant="secondary"
                    disabled={managingBilling}
                    onClick={onManageBilling}
                  >
                    {managingBilling ? 'Opening...' : 'Manage Billing'}
                  </Button>
                ) : isCurrent ? (
                  <Button className="w-full justify-center" size="sm" variant="secondary" disabled>
                    Current Plan
                  </Button>
                ) : isDowngrade ? (
                  <div className="h-12 sm:h-[36px]" aria-hidden="true" />
                ) : (
                  <Button
                    className="w-full justify-center gap-2"
                    size="sm"
                    variant="primary"
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
          </TimelineContent>
        )
      })}
    </div>
  )
}
