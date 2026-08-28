import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import type { CheckPack } from '@/types'
import { cn } from '@/utils/cn'

interface PricingCardsProps {
  packs: CheckPack[]
  loadingPack: string | null
  onBuy: (packId: CheckPack['id']) => void
}

function CornerMark({ className }: { className: string }) {
  return (
    <span className={cn('pointer-events-none absolute text-lg font-light leading-none text-border-strong', className)} aria-hidden="true">
      +
    </span>
  )
}

export function PricingCards({ packs, loadingPack, onBuy }: PricingCardsProps) {
  return (
    <div className="relative overflow-hidden rounded-[28px] border border-border-soft bg-background p-3 sm:p-5">
      {/* Same dot-grid backdrop as the landing hero (HeroSection.tsx), minus
          its blurred glow blob — texture without glow, per the redesign ask. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,rgba(2,12,56,0.12)_1px,transparent_1px)] bg-[length:28px_28px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black_0%,transparent_80%)]"
      />

      <CornerMark className="left-2 top-2 sm:left-4 sm:top-4" />
      <CornerMark className="right-2 top-2 sm:right-4 sm:top-4" />
      <CornerMark className="bottom-2 left-2 sm:bottom-4 sm:left-4" />
      <CornerMark className="bottom-2 right-2 sm:bottom-4 sm:right-4" />

      <div className="relative mx-auto grid gap-3 sm:gap-4 md:grid-cols-3">
        {packs.map((pack) => {
          const isHighlighted = Boolean(pack.highlighted)

          return (
            <div key={pack.id} className="relative h-full">
              {pack.badge ? (
                <span
                  className={cn(
                    'absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                    isHighlighted ? 'bg-blue-light text-navy' : 'bg-white text-navy',
                  )}
                >
                  {pack.badge}
                </span>
              ) : null}
              <div
                className={cn(
                  'flex h-full flex-col rounded-[20px] border bg-navy p-4 pt-6 shadow-card sm:p-5 sm:pt-7',
                  isHighlighted ? 'border-blue-light shadow-elevated' : 'border-white/15',
                )}
              >
                <h2 className="font-display text-2xl text-white sm:text-3xl">{pack.name}</h2>
                <p className="text-xs font-medium text-white/80">{pack.description}</p>

                <p className="mt-2 flex items-baseline gap-1 tracking-tight text-white">
                  <span className="text-xl font-semibold">€</span>
                  <span className="text-4xl font-semibold tracking-[-0.02em] sm:text-5xl">{pack.price.replace('€', '')}</span>
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/80">
                  €{(Number(pack.price.replace('€', '')) / pack.checks).toFixed(2)} per check
                </p>
                <p className="mt-0.5 text-xs font-medium text-white/80">One time purchase · Credits valid for 90 days</p>

                <ul className="mt-3 space-y-1.5 border-t border-white/15 pt-3 text-xs font-semibold text-white sm:text-sm">
                  {pack.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-light" strokeWidth={2} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex-1" />

                <Button
                  variant={isHighlighted ? 'accent' : 'light'}
                  className="w-full justify-center gap-2 whitespace-nowrap"
                  size="md"
                  disabled={loadingPack !== null}
                  onClick={() => onBuy(pack.id)}
                >
                  {loadingPack === pack.id ? 'Redirecting...' : 'Buy pack'}
                  {loadingPack === pack.id ? null : <ArrowRight className="h-[16px] w-[16px]" />}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
