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
    <div className="relative rounded-[28px] border border-border-soft bg-background p-3 sm:p-5">
      <CornerMark className="left-2 top-2 sm:left-4 sm:top-4" />
      <CornerMark className="right-2 top-2 sm:right-4 sm:top-4" />
      <CornerMark className="bottom-2 left-2 sm:bottom-4 sm:left-4" />
      <CornerMark className="bottom-2 right-2 sm:bottom-4 sm:right-4" />

      <div className="relative mx-auto grid gap-3 sm:gap-4 md:grid-cols-3 md:items-start">
        {packs.map((pack) => {
          const isHighlighted = Boolean(pack.highlighted)

          return (
            <div key={pack.id} className="relative">
              {pack.badge ? (
                <span
                  className={cn(
                    'absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide',
                    isHighlighted ? 'bg-blue text-white' : 'bg-border-soft text-text-secondary',
                  )}
                >
                  {pack.badge}
                </span>
              ) : null}
              <div
                className={cn(
                  'flex flex-col rounded-[20px] border p-4 pt-6 shadow-card sm:p-5 sm:pt-7',
                  isHighlighted ? 'border-navy bg-navy shadow-elevated' : 'border-border-soft bg-surface',
                )}
              >
                <h2 className={cn('font-display text-lg font-semibold sm:text-xl', isHighlighted ? 'text-white' : 'text-text-primary')}>
                  {pack.name}
                </h2>
                <p className={cn('text-xs', isHighlighted ? 'text-white/60' : 'text-text-secondary')}>{pack.description}</p>

                <p className={cn('mt-2 flex items-baseline gap-1 tracking-tight', isHighlighted ? 'text-white' : 'text-text-primary')}>
                  <span className="text-xl font-bold">€</span>
                  <span className="text-4xl font-bold sm:text-5xl">{pack.price.replace('€', '')}</span>
                </p>
                <p className={cn('mt-0.5 text-xs', isHighlighted ? 'text-white/60' : 'text-text-secondary')}>
                  One-time · expires in 90 days
                </p>

                <ul
                  className={cn(
                    'mt-3 space-y-1.5 border-t pt-3 text-xs sm:text-sm',
                    isHighlighted ? 'border-white/15 text-white/90' : 'border-border text-text-primary',
                  )}
                >
                  {pack.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-1.5">
                      <Check
                        className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isHighlighted ? 'text-blue-light' : 'text-blue')}
                        strokeWidth={2.5}
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4">
                  <Button
                    variant={isHighlighted ? 'light' : 'primary'}
                    className="w-full justify-center gap-2 whitespace-nowrap"
                    size="md"
                    disabled={loadingPack !== null}
                    onClick={() => onBuy(pack.id)}
                  >
                    {loadingPack === pack.id ? 'Redirecting...' : 'Buy pack'}
                    {loadingPack === pack.id ? null : <ArrowRight className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
