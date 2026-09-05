'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/cn'
import type { PeriodId } from '@/lib/time'

const PERIODS: { id: PeriodId; label: string }[] = [
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: '90d', label: '90 days' },
  { id: '12m', label: '12 months' },
  { id: 'ytd', label: 'Year to date' },
  { id: 'all', label: 'All time' },
]

export function PeriodPicker({ active }: { active: PeriodId }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const select = (id: PeriodId) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('period', id)
    // Custom ranges are driven by from/to; switching to a named period clears
    // them so the two cannot disagree about which window is shown.
    params.delete('from')
    params.delete('to')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div
      role="group"
      aria-label="Reporting period"
      className="flex flex-wrap gap-1 rounded-full border border-border-strong bg-surface p-1"
    >
      {PERIODS.map((period) => {
        const isActive = period.id === active
        return (
          <button
            key={period.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(period.id)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-navy font-medium text-white'
                : 'text-text-secondary hover:bg-border-soft hover:text-text-primary',
            )}
          >
            {period.label}
          </button>
        )
      })}
    </div>
  )
}
