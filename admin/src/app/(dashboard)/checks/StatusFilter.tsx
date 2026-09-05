'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/cn'

const OPTIONS = [
  { value: null, label: 'All' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'draft', label: 'Draft' },
] as const

export function StatusFilter({ active }: { active: string | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const select = (value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set('status', value)
    else params.delete('status')
    params.delete('page')
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div
      role="group"
      aria-label="Filter by status"
      className="flex flex-wrap gap-1 rounded-full border border-border-strong bg-surface p-1"
    >
      {OPTIONS.map((option) => {
        const isActive = option.value === active
        return (
          <button
            key={option.label}
            type="button"
            aria-pressed={isActive}
            onClick={() => select(option.value)}
            className={cn(
              'rounded-full px-3 py-1.5 text-sm transition-colors',
              isActive
                ? 'bg-navy font-medium text-white'
                : 'text-text-secondary hover:bg-border-soft hover:text-text-primary',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
